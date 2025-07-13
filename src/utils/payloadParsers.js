
const { Address, Slice } = require('@ton/ton'); // Assuming Slice is available or Cell.beginParse() is used

/**
 * Parses StakeParametersFromUser from a forward_payload slice.
 * Based on Tact contract structure:
 * struct StakeParametersFromUser {
 * query_id: Int as uint64;
 * stake_identifier: Int as uint64; // Unique ID for the stake on SC, derived from DB UUID
 * duration_seconds: Int as uint32;
 * OXYBLE_lock_apr_bps: Int as uint16; // Or other OXYBLE-specific lock terms
 * OXYBLE_lock_penalty_bps: Int as uint16;
 * }
 * @param {Slice} forwardPayloadSlice - The slice of the forward_payload cell.
 * @returns {object|null} Parsed parameters or null on error.
 */
function parseStakeParametersFromForwardPayload(forwardPayloadSlice) {
    try {
        // It's common for Tact forward payloads to have an initial op-code.
        // If your specific forward_payload for staking has an op-code, load it first.
        // Example: const opCode = forwardPayloadSlice.loadUint(32);
        // if (opCode !== 0xf010c513) { // Your specific op-code for this payload
        //     console.warn("parseStakeParameters: Unexpected op-code in forward_payload.", opCode);
        //     return null;
        // }

        const queryId = forwardPayloadSlice.loadUintBig(64);
        const stakeIdentifier = forwardPayloadSlice.loadUintBig(64); // This should match the one sent by frontend/backend
        const durationSeconds = forwardPayloadSlice.loadUint(32);
        const OXYBLELockAprBps = forwardPayloadSlice.loadUint(16); // Or however your SC defines it
        const OXYBLELockPenaltyBps = forwardPayloadSlice.loadUint(16); // Or however your SC defines it

        return { queryId, stakeIdentifier, durationSeconds, OXYBLELockAprBps, OXYBLELockPenaltyBps };
    } catch (e) {
        console.error("Failed to parse StakeParametersFromUser from forward_payload:", e.message);
        return null;
    }
}

/**
 * Parses the unstake response payload from the Staking Contract's Jetton Wallet.
 * Based on a potential Tact contract structure for unstake notification/response:
 * struct UnstakeResponsePayload { // Example structure
 * query_id: Int as uint64;
 * staker_address: Address;
 * stake_identifier_processed: Int as uint64;
 * final_OXYBLE_amount_returned: Coins;
 * OXYBLE_lock_reward_paid: Coins; // OXYBLE reward from the SC lock itself
 * OXYBLE_penalty_applied: Coins;  // OXYBLE penalty applied by the SC
 * }
 * @param {Slice} payloadSlice - The slice of the payload cell from the SC's Jetton Wallet transfer.
 * @returns {object|null} Parsed parameters or null on error.
 */
function parseUnstakeResponsePayload(payloadSlice) {
    try {
        // Again, check for an op-code if your SC uses one for this specific payload.
        // Example: const opCode = payloadSlice.loadUint(32);
        // if (opCode !== YOUR_UNSTAKE_RESPONSE_OP_CODE) {
        //     console.warn("parseUnstakeResponsePayload: Unexpected op-code.", opCode);
        //     return null;
        // }

        const queryId = payloadSlice.loadUintBig(64);
        const stakerAddress = payloadSlice.loadAddress();
        const stakeIdentifierProcessed = payloadSlice.loadUintBig(64);
        const finalOXYBLEAmountReturned = payloadSlice.loadCoins();
        const OXYBLELockRewardPaid = payloadSlice.loadCoins();
        const OXYBLEPenaltyApplied = payloadSlice.loadCoins();

        return {
            queryId,
            stakerAddress,
            stakeIdentifierProcessed,
            finalOXYBLEAmountReturned,
            OXYBLELockRewardPaid,
            OXYBLEPenaltyApplied
        };
    } catch (e) {
        console.error("Failed to parse UnstakeResponsePayload from forward_payload:", e.message);
        return null;
    }
}

module.exports = {
    parseStakeParametersFromForwardPayload,
    parseUnstakeResponsePayload,
};