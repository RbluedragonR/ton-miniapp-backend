// File: ar_backend/src/utils/tonUtils.js
const { TonClient, Address, Cell, toNano, fromNano, internal, contractAddress, KeyPair, mnemonicToPrivateKey } = require("@ton/ton");
const { getHttpEndpoint } = require("@orbs-network/ton-access");
const { TON_NETWORK, TON_ACCESS_API_KEY } = require('../config/envConfig');

async function getTonClient() {
  const endpointOptions = { network: TON_NETWORK };
  if (TON_ACCESS_API_KEY) {
    endpointOptions.apiKey = TON_ACCESS_API_KEY;
  }
  const endpoint = await getHttpEndpoint(endpointOptions);
  return new TonClient({ endpoint });
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
    // Ensure the address format matches the network (testOnly for testnet)
    const isTestnet = TON_NETWORK === 'testnet';
    return result.stack.readAddress().toString({ bounceable: true, testOnly: isTestnet });
  } catch (error) {
    console.error(`Error in getJettonWalletAddress for owner ${ownerAddressString}, master ${jettonMasterAddressString}: ${error.message}`);
    return null;
  }
}

function createJettonTransferMessage(
  jettonAmount, // in smallest units (BigInt)
  toAddressString,    // recipient's main wallet address
  responseAddressString, // usually sender's main wallet address
  forwardTonAmount = toNano("0.05"), // TON value for forwarding
  forwardPayload = null // Optional Cell for forward payload
) {
  const body = new Cell();
  body.bits.writeUint(0x0f8a7ea5, 32); // op_code for jetton transfer
  body.bits.writeUint(Date.now(), 64); // query_id
  body.bits.writeCoins(jettonAmount);
  body.bits.writeAddress(Address.parse(toAddressString));
  body.bits.writeAddress(Address.parse(responseAddressString));
  
  body.bits.writeBit(forwardPayload ? 1 : 0); // custom_payload is null in this common case, so store 0, then forward_ton_amount and forward_payload
                                            // if custom_payload is present, it's more complex
  // Correction: TEP-74 specifies custom_payload (Cell) then forward_ton_amount (Coins) then forward_payload (Cell)
  // For simple transfers, custom_payload is often null (represented by a bit 0).
  // Let's assume no custom_payload, just forward_payload for now.
  body.bits.writeBit(0); // No custom_payload

  body.bits.writeCoins(forwardTonAmount);

  if (forwardPayload instanceof Cell) {
    body.bits.writeBit(1); // has forward_payload
    body.refs.push(forwardPayload);
  } else {
    body.bits.writeBit(0); // no forward_payload
  }
  
  return body;
}

// Helper for backend wallet
async function getWalletForPayout(mnemonic) {
    if (!mnemonic || typeof mnemonic !== 'string' || mnemonic.split(' ').length < 12) {
        throw new Error('Invalid or missing mnemonic for backend payout wallet.');
    }
    const keyPair = await mnemonicToPrivateKey(mnemonic.split(' ')); // mnemonicToPrivateKey expects an array of words
    const { WalletContractV4 } = require('@ton/ton'); // Local require if not at top
    const workchain = 0; // Usually 0 for masterchain
    const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
    
    const client = await getTonClient();
    const contract = client.open(wallet);
    return { contract, keyPair, address: wallet.address.toString({bounceable: true, testOnly: TON_NETWORK === 'testnet'}) };
}


module.exports = { 
    getTonClient, 
    getJettonWalletAddress,
    createJettonTransferMessage,
    getWalletForPayout
};