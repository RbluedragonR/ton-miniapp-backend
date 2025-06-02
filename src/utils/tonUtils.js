const { TonClient, Address, Cell, toNano, fromNano, internal } = require("@ton/ton");
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
    return result.stack.readAddress().toString({ bounceable: true, testOnly: TON_NETWORK === 'testnet' });
  } catch (error) {
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
  const body = new Cell();
  body.bits.writeUint(0x0f8a7ea5, 32); 
  body.bits.writeUint(Date.now(), 64); 
  body.bits.writeCoins(jettonAmount);
  body.bits.writeAddress(Address.parse(toAddressString));
  body.bits.writeAddress(Address.parse(responseAddressString));
  
  body.bits.writeBit(0);

  body.bits.writeCoins(forwardTonAmount);

  if (forwardPayload instanceof Cell && !forwardPayload.isExotic && forwardPayload.refs.length <= 1 && forwardPayload.bits.length <= (1023 - 1 - 1 - 32 - 64 - 267 - 267 - 1 - 124)) { 
    body.bits.writeBit(0); 
    body.bits.writeCell(forwardPayload);
  } else if (forwardPayload instanceof Cell) {
    body.bits.writeBit(1); 
    body.refs.push(forwardPayload);
  } else {
    body.bits.writeBit(0); 
  }
  
  return body;
}

module.exports = { 
    getTonClient, 
    getJettonWalletAddress,
    createJettonTransferMessage
};
