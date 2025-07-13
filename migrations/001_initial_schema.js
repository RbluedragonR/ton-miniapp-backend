// ar_backend/migrations/001_initial_schema.js
exports.up = function(knex) {
  return knex.schema
    // Create users table
    .createTable('users', function(table) {
      table.string('wallet_address', 68).primary();
      table.bigInteger('telegram_id').unique();
      table.string('username', 255);
      table.string('referral_code', 10).unique();
      table.string('referrer_wallet_address', 68).references('wallet_address').inTable('users').onDelete('SET NULL');
      table.decimal('claimable_usdt_balance', 20, 6).notNullable().defaultTo(0);
      table.decimal('claimable_OXYBLE_rewards', 20, 9).notNullable().defaultTo(0);
      table.decimal('balance', 20, 9).notNullable().defaultTo(0);
      table.decimal('usdt_balance', 20, 6).notNullable().defaultTo(0);
      table.decimal('ton_balance', 20, 9).notNullable().defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Create indexes
      table.index('referrer_wallet_address');
      table.index('referral_code');
      table.index('telegram_id');
    })
    
    // Create staking_plans table
    .createTable('staking_plans', function(table) {
      table.increments('plan_id').primary();
      table.string('plan_key', 50).unique().notNullable();
      table.string('title', 100).notNullable();
      table.integer('duration_days').notNullable();
      table.decimal('fixed_usdt_apr_percent', 5, 2).notNullable();
      table.decimal('OXYBLE_early_unstake_penalty_percent', 5, 2).notNullable();
      table.decimal('min_stake_usdt', 10, 2).defaultTo(0);
      table.decimal('max_stake_usdt', 10, 2);
      table.decimal('referral_l1_invest_percent', 5, 2).defaultTo(0);
      table.decimal('referral_l2_invest_percent', 5, 2).defaultTo(0);
      table.decimal('referral_l2_commission_on_l1_bonus_percent', 5, 2).defaultTo(0);
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    
    // Create user_stakes table
    .createTable('user_stakes', function(table) {
      table.uuid('stake_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('user_wallet_address', 68).notNullable().references('wallet_address').inTable('users');
      table.integer('staking_plan_id').notNullable().references('plan_id').inTable('staking_plans');
      table.decimal('OXYBLE_amount_staked', 20, 9).notNullable();
      table.decimal('reference_usdt_value_at_stake_time', 20, 6).notNullable();
      table.decimal('usdt_reward_accrued_total', 20, 6).defaultTo(0);
      table.decimal('OXYBLE_penalty_applied', 20, 9).defaultTo(0);
      table.decimal('OXYBLE_final_reward_calculated', 20, 9).defaultTo(0);
      table.string('status', 30).notNullable().defaultTo('pending_confirmation');
      table.timestamp('stake_timestamp').notNullable();
      table.timestamp('unlock_timestamp').notNullable();
      table.timestamp('last_usdt_reward_calc_timestamp');
      table.string('onchain_stake_tx_hash', 64).unique();
      table.text('onchain_stake_tx_boc');
      table.string('onchain_unstake_tx_hash', 64).unique();
      table.text('onchain_unstake_tx_boc');
      table.text('notes');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Create indexes
      table.index('user_wallet_address');
      table.index('status');
    })
    
    // Create tasks table
    .createTable('tasks', function(table) {
      table.increments('task_id').primary();
      table.string('task_key', 50).unique().notNullable();
      table.string('title', 255).notNullable();
      table.text('description');
      table.decimal('reward_OXYBLE_amount', 20, 9).defaultTo(0);
      table.string('task_type', 50).defaultTo('social');
      table.string('validation_type', 50).defaultTo('manual');
      table.text('action_url');
      table.boolean('is_active').defaultTo(true);
      table.boolean('is_repeatable').defaultTo(false);
      table.integer('max_completions_user').defaultTo(1);
      table.timestamp('start_date');
      table.timestamp('end_date');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    
    // Create user_task_completions table
    .createTable('user_task_completions', function(table) {
      table.increments('completion_id').primary();
      table.string('user_wallet_address', 68).notNullable().references('wallet_address').inTable('users');
      table.integer('task_id').notNullable().references('task_id').inTable('tasks');
      table.string('status', 30).notNullable().defaultTo('pending_verification');
      table.jsonb('submission_data');
      table.timestamp('completed_at').defaultTo(knex.fn.now());
      table.timestamp('verified_at');
      table.timestamp('reward_credited_at');
      table.text('notes');
      
      // Create indexes
      table.index(['user_wallet_address', 'task_id']);
      table.index('status');
    })
    
    // Create user_OXYBLE_withdrawals table
    .createTable('user_OXYBLE_withdrawals', function(table) {
      table.increments('withdrawal_id').primary();
      table.string('user_wallet_address', 68).notNullable().references('wallet_address').inTable('users');
      table.decimal('amount_OXYBLE', 20, 9).notNullable();
      table.string('status', 20).notNullable().defaultTo('pending_payout');
      table.string('onchain_tx_hash', 64).unique();
      table.timestamp('requested_at').defaultTo(knex.fn.now());
      table.timestamp('processed_at');
      
      // Create indexes
      table.index('user_wallet_address');
      table.index('status');
    })
    
    // Create user_usdt_withdrawals table
    .createTable('user_usdt_withdrawals', function(table) {
      table.increments('withdrawal_id').primary();
      table.string('user_wallet_address', 68).notNullable().references('wallet_address').inTable('users');
      table.decimal('amount_usdt', 20, 6).notNullable();
      table.string('status', 20).notNullable().defaultTo('pending');
      table.string('onchain_tx_hash', 64).unique();
      table.text('notes');
      table.timestamp('requested_at').defaultTo(knex.fn.now());
      table.timestamp('processed_at');
      
      // Create indexes
      table.index('user_wallet_address');
      table.index('status');
    })
    
    // Create referral_rewards table
    .createTable('referral_rewards', function(table) {
      table.increments('reward_id').primary();
      table.uuid('stake_id').references('stake_id').inTable('user_stakes').onDelete('SET NULL');
      table.string('referrer_wallet_address', 68).notNullable().references('wallet_address').inTable('users');
      table.string('referred_wallet_address', 68).notNullable().references('wallet_address').inTable('users');
      table.integer('level').notNullable();
      table.string('reward_type', 50).notNullable();
      table.decimal('reward_amount_usdt', 20, 6).notNullable();
      table.string('status', 20).notNullable().defaultTo('credited');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Create indexes
      table.index('referrer_wallet_address');
      table.index('status');
    })
    
    // Create announcements table
    .createTable('announcements', function(table) {
      table.increments('announcement_id').primary();
      table.string('title', 255).notNullable();
      table.text('content').notNullable();
      table.string('type', 50).defaultTo('info');
      table.text('image_url');
      table.text('action_url');
      table.string('action_text', 100);
      table.boolean('is_pinned').defaultTo(false);
      table.boolean('is_active').defaultTo(true);
      table.timestamp('published_at').defaultTo(knex.fn.now());
      table.timestamp('expires_at');
      
      // Create indexes
      table.index(['is_active', 'is_pinned', 'published_at']);
    })
    
    // Create coinflip_history table
    .createTable('coinflip_history', function(table) {
      table.increments('game_id').primary();
      table.string('user_wallet_address', 68).notNullable().references('wallet_address').inTable('users');
      table.decimal('bet_amount_OXYBLE', 20, 9).notNullable();
      table.string('choice', 10).notNullable();
      table.string('server_coin_side', 10).notNullable();
      table.string('outcome', 10).notNullable();
      table.decimal('amount_delta_OXYBLE', 20, 9).notNullable();
      table.timestamp('played_at').defaultTo(knex.fn.now());
      
      // Create indexes
      table.index('user_wallet_address');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('coinflip_history')
    .dropTableIfExists('announcements')
    .dropTableIfExists('referral_rewards')
    .dropTableIfExists('user_usdt_withdrawals')
    .dropTableIfExists('user_OXYBLE_withdrawals')
    .dropTableIfExists('user_task_completions')
    .dropTableIfExists('tasks')
    .dropTableIfExists('user_stakes')
    .dropTableIfExists('staking_plans')
    .dropTableIfExists('users');
}; 