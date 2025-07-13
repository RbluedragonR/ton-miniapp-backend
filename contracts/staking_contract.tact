import "@stdlib/deploy";
import "@stdlib/jetton";
import "@stdlib/math";
import "@stdlib/int";


const SECONDS_IN_YEAR: Int = 31536000; 


struct StakeInfo {
    amount_staked_OXYBLE: Coins;
    start_time: Int as uint32;
    duration_seconds: Int as uint32;
    unlock_time: Int as uint32;
    OXYBLE_lock_apr_bps: Int as uint16; 
    OXYBLE_lock_penalty_bps: Int as uint16;
    is_withdrawn: Bool;
    original_staker: Address;
}


struct StakeParametersFromUser { 
    query_id: Int as uint64;
    stake_identifier: Int as uint64;
    duration_seconds: Int as uint32;
    OXYBLE_lock_apr_bps: Int as uint16;
    OXYBLE_lock_penalty_bps: Int as uint16;
}


struct UserUnstakeOXYBLEMessage { 
    query_id: Int as uint64;
    stake_identifier_to_withdraw: Int as uint64;
}


struct JettonWalletOXYBLEStakeNotification {
    query_id: Int as uint64;
    amount: Coins;
    original_staker: Address;
    forward_payload: Slice; 
}


storage StakingContract {
    owner_address: Address;
    arx_jetton_master_address: Address;
    my_arx_jetton_wallet_address: Address; 
    total_stakes_created_counter: Int as uint64;


    stakes: map<Address, map<Int, StakeInfo>>; 
}


init(owner: Address, arx_master: Address, my_jetton_wallet: Address) {
    self.owner_address = owner;
    self.arx_jetton_master_address = arx_master;
    self.my_arx_jetton_wallet_address = my_jetton_wallet;
    self.total_stakes_created_counter = 0; 
    self.stakes = emptyMap<Address, map<Int, StakeInfo>>();
}


fun calculateOXYBLELockReward(principal: Coins, apr_bps: Int, duration_seconds: Int): Coins {
    if (principal == 0 || apr_bps == 0 || duration_seconds == 0) { return 0; }
    let numerator: Int = principal * apr_bps * duration_seconds;
    let denominator: Int = 10000 * SECONDS_IN_YEAR;
    if (denominator == 0) { return 0; } 
    return numerator / denominator;
}

fun calculateOXYBLELockPenalty(principal: Coins, penalty_bps: Int): Coins {
    if (principal == 0 || penalty_bps == 0) { return 0; }
    return (principal * penalty_bps) / 10000;
}



receive(msg: JettonWalletOXYBLEStakeNotification) {
    require(context().sender == self.my_arx_jetton_wallet_address, "ERR:OXYBLE_NOTIF_NOT_FROM_OWN_JETTON_WALLET");
    
    let staker: Address = msg.original_staker;
    let amount_OXYBLE_received: Coins = msg.amount;
    
    require(msg.forward_payload.remainingBits() >= (64 + 64 + 32 + 16 + 16), "ERR:INVALID_FORWARD_PAYLOAD_SIZE");
    let params: StakeParametersFromUser = msg.forward_payload.load(StakeParametersFromUser);

    require(amount_OXYBLE_received > 0, "ERR:OXYBLE_STAKE_AMOUNT_MUST_BE_POSITIVE");
    require(params.duration_seconds > 0, "ERR:OXYBLE_DURATION_MUST_BE_POSITIVE");
    require(params.stake_identifier != 0, "ERR:STAKE_IDENTIFIER_CANNOT_BE_ZERO");

    let current_time: Int = now();
    let user_stakes_map: map<Int, StakeInfo> = self.stakes.getOrNull(staker) ?? emptyMap<Int, StakeInfo>();
    
    require(user_stakes_map.getOrNull(params.stake_identifier) == null, "ERR:STAKE_IDENTIFIER_ALREADY_EXISTS");

    let new_stake_record: StakeInfo = StakeInfo{
        amount_staked_OXYBLE: amount_OXYBLE_received,
        start_time: current_time,
        duration_seconds: params.duration_seconds,
        unlock_time: current_time + params.duration_seconds,
        OXYBLE_lock_apr_bps: params.OXYBLE_lock_apr_bps,
        OXYBLE_lock_penalty_bps: params.OXYBLE_lock_penalty_bps,
        is_withdrawn: false,
        original_staker: staker
    };

    user_stakes_map.set(params.stake_identifier, new_stake_record);
    self.stakes.set(staker, user_stakes_map);
    self.total_stakes_created_counter += 1;
}

receive(msg: UserUnstakeOXYBLEMessage) {
    let staker_address: Address = context().sender;
    let stake_id_to_process: Int = msg.stake_identifier_to_withdraw; 

    let user_stakes_map_opt: map<Int, StakeInfo>? = self.stakes.get(staker_address);
    require(user_stakes_map_opt != null, "ERR:USER_HAS_NO_OXYBLE_STAKES");
    let user_stakes_map: map<Int, StakeInfo> = user_stakes_map_opt!!;

    let stake_info_opt: StakeInfo? = user_stakes_map.get(stake_id_to_process);
    require(stake_info_opt != null, "ERR:OXYBLE_STAKE_ID_NOT_FOUND");
    let stake_info: StakeInfo = stake_info_opt!!;

    require(stake_info.original_staker == staker_address, "ERR:SENDER_NOT_OXYBLE_STAKE_OWNER");
    require(!stake_info.is_withdrawn, "ERR:OXYBLE_STAKE_ALREADY_WITHDRAWN");

    let current_time: Int = now();
    let principal_OXYBLE: Coins = stake_info.amount_staked_OXYBLE;
    let OXYBLE_lock_reward_to_pay: Coins = 0;
    let OXYBLE_penalty_to_apply: Coins = 0;
    let final_OXYBLE_amount_to_return: Coins;

    if (current_time >= stake_info.unlock_time) {
        OXYBLE_lock_reward_to_pay = self.calculateOXYBLELockReward(principal_OXYBLE, stake_info.OXYBLE_lock_apr_bps, stake_info.duration_seconds);
        final_OXYBLE_amount_to_return = principal_OXYBLE + OXYBLE_lock_reward_to_pay;
    } else {
        OXYBLE_penalty_to_apply = self.calculateOXYBLELockPenalty(principal_OXYBLE, stake_info.OXYBLE_lock_penalty_bps);
        final_OXYBLE_amount_to_return = principal_OXYBLE - OXYBLE_penalty_to_apply;
        OXYBLE_lock_reward_to_pay = 0;
    }

    if (final_OXYBLE_amount_to_return < 0) {
        final_OXYBLE_amount_to_return = 0;
    }

    let updated_stake_info: StakeInfo = StakeInfo{ ...stake_info, is_withdrawn: true };
    user_stakes_map.set(stake_id_to_process, updated_stake_info);
    self.stakes.set(staker_address, user_stakes_map);

    if (final_OXYBLE_amount_to_return > 0) {
        let jetton_wallet: JettonWallet = JettonWallet.bind(self.my_arx_jetton_wallet_address);
        let response_payload_builder: StringBuilder = beginCell()
            .storeUint(msg.query_id, 64)
            .storeAddress(staker_address)
            .storeUint(stake_id_to_process, 64) 
            .storeCoins(final_OXYBLE_amount_to_return)
            .storeCoins(OXYBLE_lock_reward_to_pay)
            .storeCoins(OXYBLE_penalty_to_apply);

        jetton_wallet.sendTransfer(
            staker_address, final_OXYBLE_amount_to_return, staker_address,
            response_payload_builder.toCell(), ton("0.05"), true
        );
    } else {
        send(SendParameters{
            to: staker_address, value: 0, mode: SendPayGasSeparately + SendIgnoreErrors,
            body: beginCell()
                  .storeUint(msg.query_id, 64)
                  .storeUint(stake_id_to_process, 64) 
                  .storeStringTail("OXYBLE Unstake processed. No OXYBLE returned.")
                  .endCell()
        });
    }
}

receive() {
    dump("StakingContract (OXYBLE Lock) received an unhandled message or bounce.");
}


get fun get_OXYBLE_stake_info(user: Address, stake_identifier: Int): StakeInfo? {
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