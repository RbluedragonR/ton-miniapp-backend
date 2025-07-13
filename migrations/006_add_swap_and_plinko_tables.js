// ar_backend/migrations/006_add_swap_and_plinko_tables.js
exports.up = function(knex) {
  return knex.schema
    .createTable('plinko_games', function(table) {
      table.increments('id').primary();
      table.string('user_wallet_address', 68).notNullable().references('wallet_address').inTable('users').onDelete('CASCADE');
      table.decimal('bet_amount', 16, 4).notNullable();
      table.string('risk').notNullable();
      table.integer('rows').notNullable();
      table.decimal('multiplier', 10, 4).notNullable();
      table.decimal('payout', 16, 4).notNullable();
      table.jsonb('path').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index('user_wallet_address');
    })
    .createTable('swaps', function(table) {
      table.increments('id').primary();
      table.string('user_wallet_address', 68).notNullable().references('wallet_address').inTable('users').onDelete('CASCADE');
      table.string('from_currency').notNullable();
      table.string('to_currency').notNullable();
      table.decimal('from_amount', 20, 9).notNullable();
      table.decimal('to_amount', 20, 9).notNullable();
      table.decimal('rate', 20, 9).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index('user_wallet_address');
    })
    .createTable('transactions', function(table) {
      table.increments('id').primary();
      table.string('user_wallet_address', 68).notNullable().references('wallet_address').inTable('users').onDelete('CASCADE');
      table.string('type', 50).notNullable();
      table.decimal('amount', 20, 9).notNullable();
      table.jsonb('metadata');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index('user_wallet_address');
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('transactions')
    .dropTableIfExists('swaps')
    .dropTableIfExists('plinko_games');
};
