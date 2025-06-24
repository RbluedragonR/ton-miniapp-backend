const db = require('../config/database');
const { USDT_DECIMALS, ARIX_DECIMALS } = require('../utils/constants');
const { sendArixJettons } = require('../utils/tonUtils');

class UserService {
    /**
     * Fetches a comprehensive user profile, including referrer details.
     * Your original method, with added fields for new balances.
     */
    async fetchUserProfile(walletAddress) {
        const userQuery = `
            SELECT 
                u.*,
                r.username as referrer_username,
                r.referral_code as referrer_code
            FROM users u
            LEFT JOIN users r ON u.referrer_wallet_address = r.wallet_address
            WHERE u.wallet_address = $1;
        `;
        const { rows } = await db.query(userQuery, [walletAddress]);

        if (rows.length === 0) {
            const newUser = await this.ensureUserExists(walletAddress);
            return {
                ...newUser,
                claimable_usdt_balance: parseFloat(newUser.claimable_usdt_balance || 0).toFixed(USDT_DECIMALS || 6),
                claimable_arix_rewards: parseFloat(newUser.claimable_arix_rewards || 0).toFixed(ARIX_DECIMALS || 9),
                balance: parseFloat(newUser.balance || 0).toFixed(ARIX_DECIMALS || 9),
                ton_balance: parseFloat(newUser.ton_balance || 0).toFixed(9),
                usdt_balance: parseFloat(newUser.usdt_balance || 0).toFixed(USDT_DECIMALS || 6),
                is_new_user: true,
            };
        }
        
        const user = rows[0];
        return {
            ...user,
            claimable_usdt_balance: parseFloat(user.claimable_usdt_balance || 0).toFixed(USDT_DECIMALS || 6),
            claimable_arix_rewards: parseFloat(user.claimable_arix_rewards || 0).toFixed(ARIX_DECIMALS || 9),
            balance: parseFloat(user.balance || 0).toFixed(ARIX_DECIMALS || 9),
            ton_balance: parseFloat(user.ton_balance || 0).toFixed(9),
            usdt_balance: parseFloat(user.usdt_balance || 0).toFixed(USDT_DECIMALS || 6),
            is_new_user: false,
        };
    }

    /**
     * Ensures a user exists, creating them if necessary.
     * Your original method, updated to initialize new balance columns.
     */
    async ensureUserExists(walletAddress, telegramId = null, username = null, referrerCodeOrAddress = null) {
        let referrerWallet = null;
        if (referrerCodeOrAddress) {
            const directReferrer = await db.query("SELECT wallet_address FROM users WHERE wallet_address = $1", [referrerCodeOrAddress]);
            if (directReferrer.rows.length > 0) {
                referrerWallet = directReferrer.rows[0].wallet_address;
            } else {
                const referrerByCode = await db.query("SELECT wallet_address FROM users WHERE referral_code = $1", [referrerCodeOrAddress]);
                if (referrerByCode.rows.length > 0) {
                    referrerWallet = referrerByCode.rows[0].wallet_address;
                }
            }
        }
        
        if (referrerWallet === walletAddress) {
            referrerWallet = null;
        }

        const query = `
            INSERT INTO users (wallet_address, telegram_id, username, referrer_wallet_address, created_at, updated_at, claimable_usdt_balance, claimable_arix_rewards, balance, ton_balance, usdt_balance)
            VALUES ($1, $2, $3, $4, NOW(), NOW(), 0, 0, 0, 0, 0)
            ON CONFLICT (wallet_address) DO UPDATE SET
                updated_at = NOW(),
                telegram_id = COALESCE(users.telegram_id, EXCLUDED.telegram_id),
                username = COALESCE(users.username, EXCLUDED.username),
                referrer_wallet_address = CASE 
                                            WHEN users.referrer_wallet_address IS NULL THEN EXCLUDED.referrer_wallet_address
                                            ELSE users.referrer_wallet_address 
                                          END
            RETURNING *;
        `;
        try {
            const { rows } = await db.query(query, [walletAddress, telegramId, username, referrerWallet]);
            return rows[0];
        } catch (error) {
            console.error(`Error in ensureUserExists for ${walletAddress}:`, error);
            throw error;
        }
    }

    /**
     * [NEW] Processes an ARIX withdrawal request.
     */
    async processArixWithdrawal(userWalletAddress, amount, recipientAddress) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const userResult = await client.query("SELECT * FROM users WHERE wallet_address = $1 FOR UPDATE", [userWalletAddress]);
            if (userResult.rows.length === 0) {
                throw new Error("User not found");
            }

            const user = userResult.rows[0];
            const currentBalance = parseFloat(user.balance);
            const withdrawalAmount = parseFloat(amount);

            if (currentBalance < withdrawalAmount) {
                throw new Error("Insufficient ARIX balance");
            }

            const newBalance = currentBalance - withdrawalAmount;
            await client.query("UPDATE users SET balance = $1, updated_at = NOW() WHERE wallet_address = $2", [newBalance, userWalletAddress]);

            await client.query(
                `INSERT INTO transactions (user_wallet_address, type, amount, asset, status, created_at, metadata) 
                 VALUES ($1, 'withdrawal', $2, 'ARIX', 'pending', NOW(), $3)`,
                [userWalletAddress, -withdrawalAmount, JSON.stringify({ recipient: recipientAddress })]
            );

            const memo = `ARIX withdrawal from ARIX Terminal. User: ${userWalletAddress}`;
            const { seqno } = await sendArixJettons(recipientAddress, withdrawalAmount, memo);

            await client.query("UPDATE transactions SET status = 'completed', external_tx_id = $1 WHERE user_wallet_address = $2 AND type = 'withdrawal' AND status = 'pending'", [seqno.toString(), userWalletAddress]);
            
            await client.query('COMMIT');

            return { success: true, message: "Withdrawal initiated successfully.", newBalance: newBalance.toFixed(ARIX_DECIMALS) };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Withdrawal processing failed:", error);
            throw new Error("Withdrawal failed: " + error.message);
        } finally {
            client.release();
        }
    }

    /**
     * [NEW] Credits a user's balance after an on-chain deposit is confirmed.
     */
    async creditArixDeposit(userWalletAddress, amount, txHash) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const existingTx = await client.query("SELECT id FROM transactions WHERE external_tx_id = $1 AND type = 'deposit'", [txHash]);
            if (existingTx.rows.length > 0) {
                console.log(`Deposit with hash ${txHash} has already been processed. Skipping.`);
                await client.query('ROLLBACK');
                return { success: false, message: "Deposit already processed." };
            }

            const user = await client.query("SELECT * FROM users WHERE wallet_address = $1 FOR UPDATE", [userWalletAddress]);
            if (user.rows.length === 0) {
                // Optionally, create the user if they don't exist
                console.warn(`User ${userWalletAddress} not found for deposit. Creating now.`);
                await this.ensureUserExists(userWalletAddress); 
                // re-fetch after creation
                 const newUser = await client.query("SELECT * FROM users WHERE wallet_address = $1 FOR UPDATE", [userWalletAddress]);
                 user.rows.push(newUser.rows[0]);
            }

            const depositAmount = parseFloat(amount);
            const newBalance = parseFloat(user.rows[0].balance) + depositAmount;

            await client.query("UPDATE users SET balance = $1, updated_at = NOW() WHERE wallet_address = $2", [newBalance, userWalletAddress]);
            
            await client.query(
                `INSERT INTO transactions (user_wallet_address, type, amount, asset, status, external_tx_id, created_at)
                 VALUES ($1, 'deposit', $2, 'ARIX', 'completed', $3, NOW())`,
                [userWalletAddress, depositAmount, txHash]
            );

            await client.query('COMMIT');
            console.log(`Successfully credited ${depositAmount} ARIX to ${userWalletAddress}.`);
            return { success: true, newBalance };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`Crediting deposit for user ${userWalletAddress} failed:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Gets a user by their referral code.
     * Your original method, preserved completely.
     */
    async getUserByReferralCode(referralCode) {
        const { rows } = await db.query("SELECT wallet_address, username FROM users WHERE referral_code = $1", [referralCode]);
        return rows[0] || null;
    }

    /**
     * NEW METHOD: Updates internal currency balances within a single transaction.
     * Uses your raw SQL and client pattern.
     */
    async updateUserBalances(walletAddress, balanceChanges, type, metadata, client) {
        const userResult = await client.query("SELECT * FROM users WHERE wallet_address = $1 FOR UPDATE", [walletAddress]);
        if (userResult.rows.length === 0) {
            throw new Error('User not found for balance update.');
        }
        const user = userResult.rows[0];

        let updateClauses = [];
        const updateValues = [];

        Object.entries(balanceChanges).forEach(([currency, change]) => {
            const floatChange = parseFloat(change);
            if (isNaN(floatChange)) return;

            let field;
            switch (currency.toUpperCase()) {
                case 'ARIX': field = 'balance'; break;
                case 'TON': field = 'ton_balance'; break;
                case 'USDT': field = 'usdt_balance'; break;
                default: throw new Error(`Invalid currency: ${currency}`);
            }
            
            const currentBalance = parseFloat(user[field] || 0);
            if (currentBalance + floatChange < 0) {
                 throw new Error(`Insufficient funds for ${currency}. Required: ${Math.abs(floatChange)}, Available: ${currentBalance}`);
            }

            updateClauses.push(`${field} = ${field} + $${updateValues.length + 1}`);
            updateValues.push(floatChange);
        });
        
        if (updateClauses.length > 0) {
            const updateQuery = `UPDATE users SET ${updateClauses.join(', ')}, updated_at = NOW() WHERE wallet_address = $${updateValues.length + 1}`;
            updateValues.push(walletAddress);
            await client.query(updateQuery, updateValues);
        }
        
        const amountForTransaction = balanceChanges['ARIX'] !== undefined ? balanceChanges['ARIX'] : (balanceChanges['USDT'] || balanceChanges['TON'] || 0);
        
        await client.query(
            // NOTE: The `transactions` table in your schema needs a `user_wallet_address` column. 
            // If it uses `user_id`, this needs adjustment or schema migration. Assuming `user_wallet_address` for consistency.
            "INSERT INTO transactions (user_wallet_address, type, amount, metadata, created_at) VALUES ($1, $2, $3, $4, NOW())",
            [walletAddress, type, amountForTransaction, JSON.stringify(metadata)]
        );
    }
    
    /**
     * NEW METHOD: Fetches transaction history for a user.
     */
    async getUserTransactions(walletAddress) {
        const { rows } = await db.query("SELECT * FROM transactions WHERE user_wallet_address = $1 ORDER BY created_at DESC", [walletAddress]);
        return rows;
    }
}

module.exports = new UserService();
