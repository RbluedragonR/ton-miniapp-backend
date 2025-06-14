exports.shorthands = undefined;

exports.up = (pgm) => {
    pgm.addColumn('crash_rounds', {
        hashed_server_seed: {
            type: 'varchar(255)'
        }
    });
};

exports.down = (pgm) => {
    pgm.dropColumn('crash_rounds', 'hashed_server_seed');
};