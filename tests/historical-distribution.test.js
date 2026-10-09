const { test } = require('node:test');
const assert = require('node:assert/strict');
const HistoricalDistribution = require('../HistoricalDistribution');

test('each historical entry is a face, preserving zeros and duplicates', () => {
    const draws = [0, 0.25, 0.5, 0.999999];
    const distribution = new HistoricalDistribution([0, 3, 3, 8], () => draws.shift());
    assert.deepEqual(Array.from({ length: 4 }, () => distribution.generate()), [0, 3, 3, 8]);
});
test('sampling is with replacement and does not mutate historical inputs', () => {
    const history = [1, 5];
    const distribution = new HistoricalDistribution(history, () => 0.75);
    assert.deepEqual(Array.from({ length: 3 }, () => distribution.generate()), [5, 5, 5]);
    assert.deepEqual(history, [1, 5]);
});
