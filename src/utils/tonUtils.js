// File: ar_backend/src/utils/tonUtils.js
const { TonClient, Address, Cell, toNano, fromNano, internal, WalletContractV4, KeyPair, mnemonicToPrivateKey } = require("@ton/ton");
const { getHttpEndpoint } = require("@orbs-network/ton-access");
const { TON_NETWORK, TON_ACCESS_API_KEY } = require('../config/envConfig');
const { USDT_DECIMALS, ARIX_DECIMALS } = require('./constants'); // Assuming USDT_DECIMALS is defined

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
        throw error; // Re-throw to indicate critical failure
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
        return result.stack.readAddress().toString({ bounceable: true, testOnly: isTestnet });
    } catch (error) {
        console.error(`Error in getJettonWalletAddress for owner ${ownerAddressString}, master ${jettonMasterAddressString}: ${error.message}`);
        return null;
    }
}

/**
 * Creates the body for a TEP-74 jetton transfer.
 * @param {bigint} jettonAmount - Amount of jettons to transfer in smallest units.
 * @param {string} toAddressString - Recipient's main wallet address.
 * @param {string} responseAddressString - Address for response/bounce (usually sender's main wallet).
 * @param {bigint} forwardTonAmount - Amount of TONs for forwarding the message (e.g., toNano('0.05')).
 * @param {Cell | null} forwardPayload - Optional payload cell.
 * @returns {Cell} The message body cell.
 */
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

/**
 * Creates a generic forward payload with a comment.
 * @param {bigint} queryId - A unique query ID.
 * @param {string} comment - A text comment for the payload.
 * @returns {Cell} The forward payload cell.
 */
function createJettonForwardPayload(queryId, comment) {
    const body = new Cell().asBuilder();
    // You can define an op-code for comments if your contracts expect one
    // body.storeUint(0x00000000, 32); // Example: op_code for text comment
    body.storeUint(queryId, 64); // query_id
    if (comment && comment.length > 0) {
        body.storeStringTail(comment.substring(0, 120)); // Limit comment length
    }
    return body.endCell();
}


async function getWalletForPayout(mnemonicWordsArray) {
    if (!mnemonicWordsArray || !Array.isArray(mnemonicWordsArray) || mnemonicWordsArray.length < 12) {
        throw new Error('Invalid or missing mnemonic for backend payout wallet. Must be an array of words.');
    }
    const keyPair = await mnemonicToPrivateKey(mnemonicWordsArray);
    const workchain = 0; // Usually 0 for masterchain
    const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });

    const client = await getTonClient();
    const contract = client.open(wallet); // Open the contract with the client
    return {
        contract, // This is the opened wallet contract instance
        keyPair,
        address: wallet.address.toString({bounceable: true, testOnly: TON_NETWORK === 'testnet'})
    };
}

/**
 * Waits for a transaction to appear on the blockchain for a given address and sequence number.
 * @param {TonClient} client - The TonClient instance.
 * @param {Address} walletAddress - The address of the wallet that sent the transaction.
 * @param {number} seqno - The sequence number of the transaction.
 * @param {number} timeoutMs - Maximum time to wait in milliseconds.
 * @param {number} intervalMs - Polling interval in milliseconds.
 * @returns {Promise<string|null>} Transaction hash if confirmed, null otherwise.
 */
async function waitForTransaction(client, walletAddress, seqno, timeoutMs = 120000, intervalMs = 5000) {
    const startTime = Date.now();
    let lastKnownLt = (await client.getContractState(walletAddress)).lastTransaction?.lt;
    if (lastKnownLt) lastKnownLt = BigInt(lastKnownLt);


    while (Date.now() - startTime < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        try {
            const transactions = await client.getTransactions(walletAddress, {
                limit: 5, // Check a few recent transactions
                // lt: lastKnownLt, // Start from last known to avoid re-fetching old txs
                // to_lt: BigInt(0),
                // hash: undefined,
                // archival: true, // Important for Vercel/serverless where state might not persist
            });

            for (const tx of transactions) {
                if (tx.seqno === seqno) {
                    if (tx.description.type === 'generic' && tx.description.computePhase.type === 'vm' && tx.description.computePhase.success) {
                        console.log(`Transaction with seqno ${seqno} confirmed for ${walletAddress.toString()}. Hash: ${tx.hash().toString('hex')}`);
                        return tx.hash().toString('hex');
                    } else {
                        console.warn(`Transaction with seqno ${seqno} found for ${walletAddress.toString()} but failed or was not generic. Status: ${tx.description.type}, Compute Exit: ${tx.description.computePhase?.type === 'vm' ? tx.description.computePhase.exitCode : 'N/A'}`);
                        return null; // Transaction found but failed
                    }
                }
            }
            // if (transactions.length > 0) { // Update lastKnownLt for next poll if needed, though seqno match is primary
            //     lastKnownLt = transactions[transactions.length - 1].lt;
            // }
        } catch (pollError) {
            console.warn(`Polling error for transaction (seqno ${seqno}, addr ${walletAddress.toString()}): ${pollError.message}`);
        }
    }
    console.error(`Transaction confirmation timed out for seqno ${seqno} on address ${walletAddress.toString()}.`);
    return null;
}


module.exports = {
    getTonClient,
    getJettonWalletAddress,
    createJettonTransferMessage,
    createJettonForwardPayload,
    getWalletForPayout,
    waitForTransaction,
};