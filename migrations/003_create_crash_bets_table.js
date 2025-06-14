// ar_backend/src/migrations/003_create_crash_bets_table.js
exports.shorthands = undefined;

exports.up = pgm => {
    pgm.createTable('crash_bets', {
        id: 'id',
        game_id: { 
            type: 'integer', 
            notNull: true,
            // Assuming crash_rounds will be used for history, otherwise use crash_games
            references: '"crash_rounds"', 
            onDelete: 'cascade' 
        },
        user_wallet_address: { 
            type: 'varchar(68)', 
            notNull: true, 
            references: '"users"', 
            onDelete: 'cascade' 
        },
        bet_amount_arix: { 
            type: 'numeric(20, 9)', 
            notNull: true 
        },
        status: { 
            type: 'varchar(20)', // 'placed', 'cashed_out', 'lost'
            notNull: true, 
            default: 'placed' 
        },
        cash_out_multiplier: { 
            type: 'numeric(10, 2)' 
        },
        payout_arix: { 
            type: 'numeric(20, 9)' 
        },
        placed_at: { 
            type: 'timestamptz', 
            notNull: true, 
            default: pgm.func('current_timestamp') 
        },
    });

    pgm.createIndex('crash_bets', 'game_id');
    pgm.createIndex('crash_bets', 'user_wallet_address');
};

exports.down = pgm => {
    pgm.dropTable('crash_bets');
};