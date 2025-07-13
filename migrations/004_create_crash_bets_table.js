// ar_backend/migrations/003_create_crash_bets_table.js
exports.up = function(knex) {
  return knex.schema.createTable('crash_bets', function(table) {
    table.increments('id').primary();
    table.integer('game_id').notNullable().references('id').inTable('crash_rounds').onDelete('CASCADE');
    table.string('user_wallet_address', 68).notNullable().references('wallet_address').inTable('users').onDelete('CASCADE');
    table.decimal('bet_amount_oxyble', 20, 9).notNullable();
    table.string('status', 20).notNullable().defaultTo('placed'); // 'placed', 'cashed_out', 'lost'
    table.decimal('cash_out_multiplier', 10, 2);
    table.decimal('payout_oxyble', 20, 9);
    table.timestamp('placed_at').defaultTo(knex.fn.now());
    
    // Create indexes
    table.index('game_id');
    table.index('user_wallet_address');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('crash_bets');
};