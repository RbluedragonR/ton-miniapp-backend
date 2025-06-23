// ar_backend/src/services/plinkoService.js
const { PLINKO_MULTIPLIERS } = require('../utils/constants');

/**
 * Simulates a Plinko ball drop. Pure logic, no side-effects.
 * @param {number} rows - The number of rows in the Plinko grid.
 * @param {string} risk - The risk level ('low', 'medium', 'high').
 * @returns {object} An object containing the final multiplier and the path taken.
 */
const runPlinko = (rows, risk) => {
    let position = 0; // Start in the middle index-wise
    const path = [];

    for (let i = 0; i < rows; i++) {
        // In a pyramid with `i` pegs in a row, the ball can move left or right.
        const direction = Math.random() < 0.5 ? 0 : 1; // 0 for left, 1 for right
        position += direction;
        path.push(direction === 0 ? 'left' : 'right');
    }

    const bucketIndex = position;
    const multipliers = PLINKO_MULTIPLIERS[rows] && PLINKO_MULTIPLIERS[rows][risk];

    if (!multipliers || bucketIndex < 0 || bucketIndex >= multipliers.length) {
        console.error(`Invalid Plinko config. Rows: ${rows}, Risk: ${risk}, BucketIndex: ${bucketIndex}`);
        throw new Error('Invalid Plinko configuration for the selected rows and risk.');
    }

    const multiplier = multipliers[bucketIndex];

    return { multiplier, path, bucketIndex };
};

module.exports = {
    runPlinko,
};
