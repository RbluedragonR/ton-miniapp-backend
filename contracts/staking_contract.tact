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
    // These APR/Penalty are for the ARIX principal lock, if any, separate from USDT rewards
    arix_lock_apr_bps: Int as uint16; // e.g., a small fixed ARIX return for locking, or 0 if none
    arix_lock_penalty_bps: Int as uint16; // Penalty on ARIX principal for early unlock
    is_withdrawn: Bool;
    original_staker: Address;
}

struct StakeParametersFromUser { // In forward_payload for ARIX stake
    query_id: Int as uint64;
    duration_seconds: Int as uint32;
    arix_lock_apr_bps: Int as uint16;    // Terms for ARIX lock
    arix_lock_penalty_bps: Int as uint16; // Terms for ARIX lock
}

struct UserUnstakeArixMessage { // To unstake ARIX principal
    query_id: Int as uint64;
    stake_id_to_withdraw: Int as uint64;
}

struct JettonWalletArixStakeNotification {
    query_id: Int as uint64;
    amount: Coins; // ARIX amount
    original_staker: Address;
    forward_payload: Slice; // Contains StakeParametersFromUser
}

storage StakingContract {
    owner_address: Address;
    arx_jetton_master_address: Address;
    my_arx_jetton_wallet_address: Address; // This SC's ARIX Jetton Wallet
    next_arix_stake_id: Int as uint64;
    arix_stakes: map<Address, map<Int, StakeInfo>>; 
}

init(owner: Address, arx_master: Address, my_jetton_wallet: Address) {
    self.owner_address = owner;
    self.arx_jetton_master_address = arx_master;
    self.my_arx_jetton_wallet_address = my_jetton_wallet;
    self.next_arix_stake_id = 1;
    self.arix_stakes = emptyMap<Address, map<Int, StakeInfo>>();
}

fun calculateArixLockReward(principal: Coins, apr_bps: Int, duration_seconds: Int): Coins {
    if (principal == 0 || apr_bps == 0 || duration_seconds == 0) { return 0; }
    return (principal * apr_bps * duration_seconds) / (10000 * SECONDS_IN_YEAR);
}

fun calculateArixLockPenalty(principal: Coins, penalty_bps: Int): Coins {
    if (principal == 0 || penalty_bps == 0) { return 0; }
    return (principal * penalty_bps) / 10000;
}

receive(msg: JettonWalletArixStakeNotification) { // Handles ARIX deposit
    require(context().sender == self.my_arx_jetton_wallet_address, "ERR:ARIX_NOTIF_NOT_FROM_OWN_JETTON_WALLET");
    let staker: Address = msg.original_staker;
    let amount_arix: Coins = msg.amount;
    let params: StakeParametersFromUser = msg.forward_payload.load(StakeParametersFromUser);

    require(amount_arix > 0, "ERR:ARIX_STAKE_ZERO");
    // Further validation of params.duration_seconds etc. can be added

    let current_time: Int = now();
    let user_stakes: map<Int, StakeInfo> = self.arix_stakes.getOrNull(staker) ?? emptyMap<Int, StakeInfo>();
    let stake_id: Int = self.next_arix_stake_id;
    self.next_arix_stake_id += 1;

    user_stakes.set(stake_id, StakeInfo{
        amount_staked_arix: amount_arix, start_time: current_time,
        duration_seconds: params.duration_seconds, unlock_time: current_time + params.duration_seconds,
        arix_lock_apr_bps: params.arix_lock_apr_bps, arix_lock_penalty_bps: params.arix_lock_penalty_bps,
        is_withdrawn: false, original_staker: staker
    });
    self.arix_stakes.set(staker, user_stakes);
}

receive(msg: UserUnstakeArixMessage) { // Handles ARIX principal withdrawal request
    let staker: Address = context().sender;
    let stake_id: Int = msg.stake_id_to_withdraw;
    let user_stakes: map<Int, StakeInfo> = self.arix_stakes.getOrNull(staker) ?? emptyMap<Int, StakeInfo>();
    let stake: StakeInfo = user_stakes.getOrNull(stake_id) ?? fail("ERR:ARIX_STAKE_NOT_FOUND");
    require(!stake.is_withdrawn, "ERR:ARIX_STAKE_WITHDRAWN");

    let current_time: Int = now();
    let principal_arix: Coins = stake.amount_staked_arix;
    let reward_arix: Coins = 0;
    let penalty_arix: Coins = 0;
    let return_arix: Coins;

    if (current_time >= stake.unlock_time) { // Full term
        reward_arix = self.calculateArixLockReward(principal_arix, stake.arix_lock_apr_bps, stake.duration_seconds);
        return_arix = principal_arix + reward_arix;
    } else { // Early unstake
        penalty_arix = self.calculateArixLockPenalty(principal_arix, stake.arix_lock_penalty_bps);
        return_arix = principal_arix - penalty_arix;
        reward_arix = 0; // ARIX lock rewards forfeited if early
    }
    if (return_arix < 0) { return_arix = 0; }

    user_stakes.set(stake_id, StakeInfo{...stake, is_withdrawn: true});
    self.arix_stakes.set(staker, user_stakes);

    if (return_arix > 0) {
        JettonWallet.bind(self.my_arx_jetton_wallet_address).sendTransfer(
            staker, return_arix, staker, 
            beginCell().storeUint(msg.query_id, 64).storeStringTail("ARIX Unstake").endCell(), 
            ton("0.05"), true
        );
    } else { /* Send notification message if 0 ARIX returned */ }
}

// --- GET METHODS for ARIX Stakes ---
get fun get_arix_stake_info(user: Address, stake_id: Int): StakeInfo? { /* ... */ }
// ... other get methods as needed for ARIX stakes ...

