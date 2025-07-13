/**
 * ar_backend/src/listeners/OXYBLEDepositListener.js
 *
 * [FIXED VERSION]
 * This script runs as a standalone process to monitor the blockchain for incoming OXYBLE deposits
 * to the application's hot wallet.
 *
 * FIXED: Now reads environment variables directly from process.env instead of config file
 *
 * HOW IT WORKS:
 * 1. It gets the hot wallet's OXYBLE jetton wallet address.
 * 2. It subscribes to all transactions for that jetton wallet address.
 * 3. When a transaction comes in, it parses the message body to find the amount and the memo.
 * 4. The memo *MUST* contain the depositor's wallet address for their account to be credited.
 * 5. It calls the `handleOXYBLEDeposit` controller function to process the deposit.
 *
 * TO RUN:
 * You need to run this script as a background service on your server, alongside your main API server.
 * e.g., `node src/listeners/OXYBLEDepositListener.js`
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { TonClient, Address, fromNano } = require("@ton/ton");
const { getHttpEndpoint } = require("@orbs-network/ton-access");
const { getJettonWalletAddress } = require('../utils/tonUtils');
const { handleOXYBLEDeposit } = require('../controllers/userController');

// FIXED: Read ALL environment variables directly from process.env (Railway)
const HOT_WALLET_ADDRESS = process.env.HOT_WALLET_ADDRESS;
const TON_NETWORK = process.env.TON_NETWORK || 'mainnet';
const OXYBLE_TOKEN_MASTER_ADDRESS = process.env.OXYBLE_TOKEN_MASTER_ADDRESS;

// Debug: Log environment variables at startup
console.log('=== ENVIRONMENT VARIABLES DEBUG ===');
console.log('HOT_WALLET_ADDRESS:', HOT_WALLET_ADDRESS);
console.log('TON_NETWORK:', TON_NETWORK);
console.log('OXYBLE_TOKEN_MASTER_ADDRESS:', OXYBLE_TOKEN_MASTER_ADDRESS);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('All available env vars with WALLET or OXYBLE:');
Object.keys(process.env).filter(key => key.includes('WALLET') || key.includes('OXYBLE')).forEach(key => {
    console.log(`  ${key}: ${process.env[key]}`);
});
console.log('=== END DEBUG ===');

// Helper to check if a string is a valid TON address
const isValidTonAddress = (addr) => {
    if (!addr) return false;
    try {
        Address.parse(addr);
        return true;
    } catch (e) { return false; }
};

async function listenForOXYBLEDeposits() {
    // Check all required environment variables
    if (!HOT_WALLET_ADDRESS) {
        console.error("FATAL: HOT_WALLET_ADDRESS is not defined in your environment variables. Listener cannot start.");
        console.error("Available environment variables containing 'WALLET':");
        Object.keys(process.env).filter(key => key.includes('WALLET')).forEach(key => {
            console.error(`  ${key}: ${process.env[key]}`);
        });
        return;
    }
    
    if (!OXYBLE_TOKEN_MASTER_ADDRESS) {
        console.error("FATAL: OXYBLE_TOKEN_MASTER_ADDRESS is not defined in your environment variables. Listener cannot start.");
        console.error("Available environment variables containing 'OXYBLE' or 'TOKEN':");
        Object.keys(process.env).filter(key => key.includes('OXYBLE') || key.includes('TOKEN')).forEach(key => {
            console.error(`  ${key}: ${process.env[key]}`);
        });
        return;
    }

    console.log("Starting OXYBLE deposit listener...");
    console.log(`Network: ${TON_NETWORK}`);
    console.log(`Hot Wallet: ${HOT_WALLET_ADDRESS}`);
    
    const endpoint = await getHttpEndpoint({ network: TON_NETWORK });
    const client = new TonClient({ endpoint });

    const hotWalletJettonAddress = await getJettonWalletAddress(HOT_WALLET_ADDRESS, OXYBLE_TOKEN_MASTER_ADDRESS);
    if (!hotWalletJettonAddress) {
        console.error(`Could not derive Jetton Wallet address for hot wallet ${HOT_WALLET_ADDRESS}. Exiting.`);
        return;
    }

    console.log(`Listening for OXYBLE deposits on Jetton Wallet: ${hotWalletJettonAddress.toString({ testOnly: TON_NETWORK === 'testnet' })}`);

    // Subscribe to transactions of the hot wallet's Jetton wallet
    // Note: This method is experimental in ton.js and might change.
    // It polls getTransactions every few seconds.
    let lastKnownLt = (await client.getContractState(hotWalletJettonAddress)).lastTransaction?.lt;
    if (lastKnownLt) lastKnownLt = BigInt(lastKnownLt);

    setInterval(async () => {
        try {
            const transactions = await client.getTransactions(hotWalletJettonAddress, {
                limit: 10,
                // lt: lastKnownLt, // Polling from last known can miss transactions in some RPCs
                archival: true,
            });

            for (const tx of transactions) {
                // Check if it's an incoming internal message
                if (tx.inMessage && tx.inMessage.info.type === 'internal') {
                    const body = tx.inMessage.body.beginParse();
                    
                    if (body.remainingBits < 32) continue; // Not enough data for op code
                    const op = body.loadUint(32);

                    // Jetton transfer op_code is 0x0f8a7ea5
                    if (op === 0x0f8a7ea5) {
                        body.loadUint(64); // query_id
                        const amount = fromNano(body.loadCoins());

                        // The sender of the jettons is the `from_address`
                        const fromAddress = body.loadAddress();
                        if (!fromAddress) continue;
                        
                        body.loadAddress(); // response_address

                        const forwardTonAmount = body.loadCoins();
                        const forwardPayloadExists = body.loadBit();

                        let memo = null;
                        if (forwardPayloadExists) {
                            const forwardPayload = body.loadRef().beginParse();
                             // Try to parse as a comment (standard is op code 0, then text)
                            if (forwardPayload.remainingBits > 32) {
                                forwardPayload.loadUint(32); // Skip potential op_code for comment
                            }
                             if (forwardPayload.remainingBits > 0) {
                                memo = forwardPayload.loadStringTail();
                            }
                        }

                        if (memo && isValidTonAddress(memo)) {
                            console.log(`[DEPOSIT DETECTED]`);
                            console.log(`  -> Amount: ${amount} OXYBLE`);
                            console.log(`  -> From: ${fromAddress.toString({ testOnly: TON_NETWORK === 'testnet' })}`);
                            console.log(`  -> Memo (User Wallet): ${memo}`);
                            console.log(`  -> Tx Hash: ${tx.hash().toString('hex')}`);

                            await handleOXYBLEDeposit({
                                userWalletAddress: memo,
                                amount: parseFloat(amount),
                                txHash: tx.hash().toString('hex')
                            });

                        } else {
                            console.warn(`[IGNORED DEPOSIT] TxHash: ${tx.hash().toString('hex')}. Reason: Memo is missing or not a valid TON address. Memo found: "${memo}"`);
                        }
                    }
                }
            }
            if (transactions.length > 0) {
                 lastKnownLt = transactions[0].lt; // Update to the latest transaction's LT
            }
        } catch (e) {
            console.error("Error polling for transactions:", e);
        }
    }, 15000); // Poll every 15 seconds
}

listenForOXYBLEDeposits().catch(console.error);