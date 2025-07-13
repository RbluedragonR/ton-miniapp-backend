/**
 * Migration: Add Telegram authentication columns to users table
 */
exports.up = async function(knex) {
    await knex.schema.alterTable('users', function(table) {
        // Add Telegram-specific columns
        table.string('telegram_username').nullable();
        table.string('telegram_first_name').nullable();
        table.string('telegram_last_name').nullable();
        table.string('telegram_language_code', 10).nullable();
        table.boolean('telegram_is_premium').defaultTo(false);
        table.jsonb('web_app_info').nullable();
        table.timestamp('last_telegram_auth').nullable();
    });
    // Use raw SQL for idempotent index creation
    await knex.raw('CREATE INDEX IF NOT EXISTS users_telegram_id_index ON users(telegram_id)');
    await knex.raw('CREATE INDEX IF NOT EXISTS users_telegram_username_index ON users(telegram_username)');
};

exports.down = async function(knex) {
    await knex.schema.alterTable('users', function(table) {
        // Remove indexes
        table.dropColumn('telegram_username');
        table.dropColumn('telegram_first_name');
        table.dropColumn('telegram_last_name');
        table.dropColumn('telegram_language_code');
        table.dropColumn('telegram_is_premium');
        table.dropColumn('web_app_info');
        table.dropColumn('last_telegram_auth');
    });
    await knex.raw('DROP INDEX IF EXISTS users_telegram_id_index');
    await knex.raw('DROP INDEX IF EXISTS users_telegram_username_index');
}; 