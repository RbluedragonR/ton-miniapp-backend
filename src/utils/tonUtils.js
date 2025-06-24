/**
 * ar_backend/src/utils/tonUtils.js
 *
 * This file contains utility functions for interacting with the TON blockchain.
 * REVISIONS:
 * - Added `sendArixJettons` function to handle on-chain ARIX withdrawals from the hot wallet.
 * - This new function is built upon your existing helpers for consistency.
 * - It constructs and sends a jetton transfer transaction.
 */
const { TonClient, Address, Cell, toNano, fromNano, internal, WalletContractV4, KeyPair, mnemonicToPrivateKey } = require("@ton/ton");
const { getHttpEndpoint } = require("@orbs-network/ton-access");
const { TON_NETWORK, TON_ACCESS_API_KEY, HOT_WALLET_MNEMONIC } = require('../config/envConfig');
const { USDT_DECIMALS, ARIX_DECIMALS, ARIX_TOKEN_MASTER_ADDRESS } = require('./constants');

let memoizedTonClient = null;

async function getTonClient() {
    if (memoizedTonClient) {
        return memoizedTonClient;
    }
    try {
        const endpointOptions = { network: TON_NETWORK };
        if (TON_ACCESS_API_KEY) {
            endpointOptions.apiKey = TON_ACCESS_API_KEY;
        }
        const endpoint = await getHttpEndpoint(endpointOptions);
        memoizedTonClient = new TonClient({ endpoint });
        return memoizedTonClient;
    } catch (error) {
        console.error("Error initializing TonClient (backend):", error);
        throw error;
    }
}

async function getJettonWalletAddress(ownerAddressString, jettonMasterAddressString) {
    if (!ownerAddressString || !jettonMasterAddressString) {
        console.warn("getJettonWalletAddress: Missing owner or master address.");
        return null;
    }
    try {
        const client = await getTonClient();
        const masterAddress = Address.parse(jettonMasterAddressString);
        const owner = Address.parse(ownerAddressString);

        const result = await client.runMethod(
            masterAddress,
            "get_wallet_address",
            [{ type: "slice", cell: new Cell().asBuilder().storeAddress(owner).endCell() }]
        );
        const isTestnet = TON_NETWORK === 'testnet';
        return result.stack.readAddress(); // Return Address object
    } catch (error) {
        console.error(`Error in getJettonWalletAddress for owner ${ownerAddressString}, master ${jettonMasterAddressString}: ${error.message}`);
        return null;
    }
}

function createJettonTransferMessage(
    jettonAmount,
    toAddressString,
    responseAddressString,
    forwardTonAmount = toNano("0.05"),
    forwardPayload = null
) {
    const bodyBuilder = new Cell().asBuilder();
    bodyBuilder.storeUint(0x0f8a7ea5, 32); // op_code for jetton transfer
    bodyBuilder.storeUint(BigInt(Date.now()), 64); // query_id
    bodyBuilder.storeCoins(jettonAmount);
    bodyBuilder.storeAddress(Address.parse(toAddressString));
    bodyBuilder.storeAddress(Address.parse(responseAddressString));
    bodyBuilder.storeBit(false); // custom_payload is null
    bodyBuilder.storeCoins(forwardTonAmount);

    if (forwardPayload instanceof Cell) {
        bodyBuilder.storeBit(true); // has forward_payload
        bodyBuilder.storeRef(forwardPayload);
    } else {
        bodyBuilder.storeBit(false); // no forward_payload
    }
    return bodyBuilder.endCell();
}

function createJettonForwardPayload(queryId, comment) {
    const body = new Cell().asBuilder();
    body.storeUint(queryId, 64);
    if (comment && comment.length > 0) {
        body.storeStringTail(comment.substring(0, 120));
    }
    return body.endCell();
}

async function getWalletForPayout() {
    const mnemonicWordsArray = (HOT_WALLET_MNEMONIC || "").split(' ');
    if (!mnemonicWordsArray || !Array.isArray(mnemonicWordsArray) || mnemonicWordsArray.length < 12) {
        throw new Error('Invalid or missing HOT_WALLET_MNEMONIC. Must be a space-separated string of words in your environment variables.');
    }
    const keyPair = await mnemonicToPrivateKey(mnemonicWordsArray);
    const workchain = 0;
    const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });

    const client = await getTonClient();
    const contract = client.open(wallet);
    return {
        contract,
        keyPair,
        address: wallet.address
    };
}

async function waitForTransaction(client, walletAddress, seqno, timeoutMs = 120000, intervalMs = 5000) {
    const startTime = Date.now();
    let lastKnownLt = (await client.getContractState(walletAddress)).lastTransaction?.lt;
    if (lastKnownLt) lastKnownLt = BigInt(lastKnownLt);

    while (Date.now() - startTime < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        try {
            const transactions = await client.getTransactions(walletAddress, { limit: 5 });

            for (const tx of transactions) {
                if (tx.seqno === seqno) {
                    if (tx.description.type === 'generic' && tx.description.computePhase.type === 'vm' && tx.description.computePhase.success) {
                        console.log(`Transaction with seqno ${seqno} confirmed for ${walletAddress.toString()}. Hash: ${tx.hash().toString('hex')}`);
                        return tx.hash().toString('hex');
                    } else {
                        console.warn(`Transaction with seqno ${seqno} found for ${walletAddress.toString()} but failed or was not generic.`);
                        return null;
                    }
                }
            }
        } catch (pollError) {
            console.warn(`Polling error for transaction (seqno ${seqno}, addr ${walletAddress.toString()}): ${pollError.message}`);
        }
    }
    console.error(`Transaction confirmation timed out for seqno ${seqno} on address ${walletAddress.toString()}.`);
    return null;
}

/**
 * [NEW] Sends ARIX jettons from the hot wallet.
 * @param {string} toAddressString - The recipient's main wallet address.
 * @param {number|string} amount - The amount of ARIX to send (in human-readable format, e.g., 100.5).
 * @param {string} memo - A text comment for the transaction.
 * @returns {Promise<{success: boolean, seqno: number}>}
 */
async function sendArixJettons(toAddressString, amount, memo) {
    const client = await getTonClient();
    const hotWallet = await getWalletForPayout();

    const hotWalletJettonAddress = await getJettonWalletAddress(hotWallet.address.toString(), ARIX_TOKEN_MASTER_ADDRESS);
    if (!hotWalletJettonAddress) {
        throw new Error("Could not derive the hot wallet's ARIX jetton address.");
    }
    
    // Create the message body for the jetton transfer
    const forwardPayload = memo ? createJettonForwardPayload(BigInt(0), memo) : null;
    const jettonAmount = toNano(amount.toString());
    const messageBody = createJettonTransferMessage(
        jettonAmount,
        toAddressString,
        hotWallet.address.toString(), // response address
        toNano('0.05'),
        forwardPayload
    );

    // Get the sequence number for the hot wallet
    const seqno = await hotWallet.contract.getSeqno();

    // Send the transaction from the main hot wallet to its own jetton wallet
    await hotWallet.contract.sendTransfer({
        secretKey: hotWallet.keyPair.secretKey,
        seqno: seqno,
        messages: [
            internal({
                to: hotWalletJettonAddress,
                value: toNano("0.1"), // tons to send with the message to the jetton wallet
                body: messageBody,
            }),
        ],
    });

    console.log(`Withdrawal transaction sent with seqno: ${seqno}. Waiting for confirmation...`);

    // Optional: wait for the transaction to be confirmed
    // await waitForTransaction(client, hotWallet.address, seqno);

    return { success: true, seqno };
}


module.exports = {
    getTonClient,
    getJettonWalletAddress,
    createJettonTransferMessage,
    createJettonForwardPayload,
    getWalletForPayout,
    waitForTransaction,
    sendArixJettons, // <-- Export the new function
};
