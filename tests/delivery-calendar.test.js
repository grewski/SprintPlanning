const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deliveryProbability } = require('../delivery-calendar');
test('delivery probabilities step at sprint ends and include all matching simulations', () => {
    const results = [1, 2, 2, 3];
    assert.equal(deliveryProbability(results, 13, 14), 0);
    assert.equal(deliveryProbability(results, 14, 14), 25);
    assert.equal(deliveryProbability(results, 27, 14), 25);
    assert.equal(deliveryProbability(results, 28, 14), 75);
    assert.equal(deliveryProbability(results, 42, 14), 100);
});
test('empty forecasts, zero backlog and daily sprints', () => {
    assert.equal(deliveryProbability([], 14, 14), null);
    assert.equal(deliveryProbability([1], -1, 14), null);
    assert.equal(deliveryProbability([0, 0], 1, 14), 100);
    assert.equal(deliveryProbability([1, 2], 1, 1), 50);
});

test('calendar opens at the first strictly green month, including sprint end boundaries', () => {
    const { firstGreenMonth } = require('../delivery-calendar');
    const start = Date.UTC(2026, 0, 1);
    // Exactly 85% finish in January; green first starts on February 11.
    const results = [...Array(85).fill(1), ...Array(15).fill(3)];
    assert.equal(firstGreenMonth(results, start, 14).toISOString(), '2026-02-01T00:00:00.000Z');
    assert.equal(firstGreenMonth([1], start, 31).toISOString(), '2026-01-01T00:00:00.000Z');
    assert.equal(firstGreenMonth([0], start, 14).toISOString(), '2026-01-01T00:00:00.000Z');
    assert.equal(firstGreenMonth([], start, 14), null);
});
