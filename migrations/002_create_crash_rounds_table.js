// ar_backend/migrations/002_create_crash_rounds_table.js
exports.up = function(knex) {
  return knex.schema.createTable('crash_rounds', function(table) {
    table.increments('id').primary();
    table.decimal('crash_multiplier', 10, 2).notNullable();
    table.string('server_seed', 255);
    table.string('public_hash', 255);
    table.string('hashed_server_seed', 255);
    table.string('status', 20).notNullable().defaultTo('waiting');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Create index for performance
    table.index(['status', 'id']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('crash_rounds');
}; 