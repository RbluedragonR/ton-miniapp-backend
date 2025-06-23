// ar_backend/migrations/005_add_swap_and_plinko_tables.js
exports.up = function(knex) {
  return knex.schema
    .table('users', function(table) {
      table.decimal('ton_balance', 18, 9).notNullable().defaultTo(0);
      table.decimal('usdt_balance', 18, 6).notNullable().defaultTo(0);
    })
    .createTable('plinko_games', function(table) {
      table.increments('id').primary();
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.decimal('bet_amount', 16, 2).notNullable();
      table.string('risk').notNullable();
      table.integer('rows').notNullable();
      table.decimal('multiplier', 10, 4).notNullable();
      table.decimal('payout', 16, 2).notNullable();
      table.jsonb('path').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('swaps', function(table) {
        table.increments('id').primary();
        table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('from_currency').notNullable();
        table.string('to_currency').notNullable();
        table.decimal('from_amount', 18, 9).notNullable();
        table.decimal('to_amount', 18, 9).notNullable();
        table.decimal('rate', 18, 9).notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('swaps')
    .dropTableIfExists('plinko_games')
    .table('users', function(table) {
      table.dropColumn('ton_balance');
      table.dropColumn('usdt_balance');
    });
};
