import "@stdlib/deploy";
import "@stdlib/jetton";
import "@stdlib/math";
import "@stdlib/int";

// ------------ CONTRACT CONFIGURATION (for ARIX Lock) ------------ //
const SECONDS_IN_YEAR: Int = 31536000; 

// ------------ DATA STRUCTURES (for ARIX Lock) ------------ //
struct StakeInfo {
    amount_staked_arix: Coins;
    start_time: Int as uint32;
    duration_seconds: Int as uint32;
    unlock_time: Int as uint32;
    arix_lock_apr_bps: Int as uint16; 
    arix_lock_penalty_bps: Int as uint16;
    is_withdrawn: Bool;
    original_staker: Address;
}

// In forward_payload for ARIX stake when user sends Jettons to SC's Jetton Wallet
struct StakeParametersFromUser { 
    query_id: Int as uint64;
    stake_identifier: Int as uint64; // Derived from DB UUID (e.g., first 64 bits)
    duration_seconds: Int as uint32;
    arix_lock_apr_bps: Int as uint16;
    arix_lock_penalty_bps: Int as uint16;
}

// Message sent by user directly to this StakingContract to initiate ARIX unstake
struct UserUnstakeArixMessage { 
    query_id: Int as uint64;
    stake_identifier_to_withdraw: Int as uint64; // The same identifier used at staking time
}

// Notification from this contract's ARIX Jetton Wallet
struct JettonWalletArixStakeNotification {
    query_id: Int as uint64;
    amount: Coins;
    original_staker: Address;
    forward_payload: Slice; 
}

// ------------ CONTRACT STORAGE ------------ //
storage StakingContract {
    owner_address: Address;
    arx_jetton_master_address: Address;
    my_arx_jetton_wallet_address: Address; 
    total_stakes_created_counter: Int as uint64; // Optional: a general counter

    // Main storage: UserAddress -> (StakeIdentifier (from UUID) -> StakeInfo)
    stakes: map<Address, map<Int, StakeInfo>>; 
}

// ------------ INITIALIZATION ------------ //
init(owner: Address, arx_master: Address, my_jetton_wallet: Address) {
    self.owner_address = owner;
    self.arx_jetton_master_address = arx_master;
    self.my_arx_jetton_wallet_address = my_jetton_wallet;
    self.total_stakes_created_counter = 0; 
    self.stakes = emptyMap<Address, map<Int, StakeInfo>>();
}

// ------------ HELPER FUNCTIONS (MATH for ARIX Lock) ------------ //
fun calculateArixLockReward(principal: Coins, apr_bps: Int, duration_seconds: Int): Coins {
    if (principal == 0 || apr_bps == 0 || duration_seconds == 0) { return 0; }
    let numerator: Int = principal * apr_bps * duration_seconds;
    let denominator: Int = 10000 * SECONDS_IN_YEAR;
    if (denominator == 0) { return 0; } 
    return numerator / denominator;
}

fun calculateArixLockPenalty(principal: Coins, penalty_bps: Int): Coins {
    if (principal == 0 || penalty_bps == 0) { return 0; }
    return (principal * penalty_bps) / 10000;
}

// ------------ RECEIVE FUNCTIONS (MESSAGE HANDLERS) ------------ //

receive(msg: JettonWalletArixStakeNotification) {
    require(context().sender == self.my_arx_jetton_wallet_address, "ERR:ARIX_NOTIF_NOT_FROM_OWN_JETTON_WALLET");
    
    let staker: Address = msg.original_staker;
    let amount_arix_received: Coins = msg.amount;
    
    require(msg.forward_payload.remainingBits() >= (64 + 64 + 32 + 16 + 16), "ERR:INVALID_FORWARD_PAYLOAD_SIZE");
    let params: StakeParametersFromUser = msg.forward_payload.load(StakeParametersFromUser);

    require(amount_arix_received > 0, "ERR:ARIX_STAKE_AMOUNT_MUST_BE_POSITIVE");
    require(params.duration_seconds > 0, "ERR:ARIX_DURATION_MUST_BE_POSITIVE");
    require(params.stake_identifier != 0, "ERR:STAKE_IDENTIFIER_CANNOT_BE_ZERO");

    let current_time: Int = now();
    let user_stakes_map: map<Int, StakeInfo> = self.stakes.getOrNull(staker) ?? emptyMap<Int, StakeInfo>();
    
    require(user_stakes_map.getOrNull(params.stake_identifier) == null, "ERR:STAKE_IDENTIFIER_ALREADY_EXISTS");

    let new_stake_record: StakeInfo = StakeInfo{
        amount_staked_arix: amount_arix_received,
        start_time: current_time,
        duration_seconds: params.duration_seconds,
        unlock_time: current_time + params.duration_seconds,
        arix_lock_apr_bps: params.arix_lock_apr_bps,
        arix_lock_penalty_bps: params.arix_lock_penalty_bps,
        is_withdrawn: false,
        original_staker: staker
    };

    user_stakes_map.set(params.stake_identifier, new_stake_record);
    self.stakes.set(staker, user_stakes_map);
    self.total_stakes_created_counter += 1;
}

receive(msg: UserUnstakeArixMessage) {
    let staker_address: Address = context().sender;
    let stake_id_to_process: Int = msg.stake_identifier_to_withdraw; 

    let user_stakes_map_opt: map<Int, StakeInfo>? = self.stakes.get(staker_address);
    require(user_stakes_map_opt != null, "ERR:USER_HAS_NO_ARIX_STAKES");
    let user_stakes_map: map<Int, StakeInfo> = user_stakes_map_opt!!;

    let stake_info_opt: StakeInfo? = user_stakes_map.get(stake_id_to_process);
    require(stake_info_opt != null, "ERR:ARIX_STAKE_ID_NOT_FOUND");
    let stake_info: StakeInfo = stake_info_opt!!;

    require(stake_info.original_staker == staker_address, "ERR:SENDER_NOT_ARIX_STAKE_OWNER");
    require(!stake_info.is_withdrawn, "ERR:ARIX_STAKE_ALREADY_WITHDRAWN");

    let current_time: Int = now();
    let principal_arix: Coins = stake_info.amount_staked_arix;
    let arix_lock_reward_to_pay: Coins = 0;
    let arix_penalty_to_apply: Coins = 0;
    let final_arix_amount_to_return: Coins;

    if (current_time >= stake_info.unlock_time) {
        arix_lock_reward_to_pay = self.calculateArixLockReward(principal_arix, stake_info.arix_lock_apr_bps, stake_info.duration_seconds);
        final_arix_amount_to_return = principal_arix + arix_lock_reward_to_pay;
    } else {
        arix_penalty_to_apply = self.calculateArixLockPenalty(principal_arix, stake_info.arix_lock_penalty_bps);
        final_arix_amount_to_return = principal_arix - arix_penalty_to_apply;
        arix_lock_reward_to_pay = 0;
    }

    if (final_arix_amount_to_return < 0) {
        final_arix_amount_to_return = 0;
    }

    let updated_stake_info: StakeInfo = StakeInfo{ ...stake_info, is_withdrawn: true };
    user_stakes_map.set(stake_id_to_process, updated_stake_info);
    self.stakes.set(staker_address, user_stakes_map);

    if (final_arix_amount_to_return > 0) {
        let jetton_wallet: JettonWallet = JettonWallet.bind(self.my_arx_jetton_wallet_address);
        let response_payload_builder: StringBuilder = beginCell()
            .storeUint(msg.query_id, 64)
            .storeAddress(staker_address)
            .storeUint(stake_id_to_process, 64) 
            .storeCoins(final_arix_amount_to_return)
            .storeCoins(arix_lock_reward_to_pay)
            .storeCoins(arix_penalty_to_apply);

        jetton_wallet.sendTransfer(
            staker_address, final_arix_amount_to_return, staker_address,
            response_payload_builder.toCell(), ton("0.05"), true
        );
    } else {
        send(SendParameters{
            to: staker_address, value: 0, mode: SendPayGasSeparately + SendIgnoreErrors,
            body: beginCell()
                  .storeUint(msg.query_id, 64)
                  .storeUint(stake_id_to_process, 64) 
                  .storeStringTail("ARIX Unstake processed. No ARIX returned.")
                  .endCell()
        });
    }
}

receive() {
    dump("StakingContract (ARIX Lock) received an unhandled message or bounce.");
}

// ------------ GET METHODS ------------ //
get fun get_arix_stake_info(user: Address, stake_identifier: Int): StakeInfo? {
    let user_stakes_map: map<Int, StakeInfo>? = self.stakes.get(user);
    if (user_stakes_map == null) {
        return null;
    }
    return user_stakes_map!!.get(stake_identifier);
}

get fun get_owner(): Address { return self.owner_address; }
get fun get_arx_jetton_master(): Address { return self.arx_jetton_master_address; }
get fun get_my_arx_jetton_wallet(): Address { return self.my_arx_jetton_wallet_address; }
get fun get_total_stakes_counter(): Int { return self.total_stakes_created_counter; }