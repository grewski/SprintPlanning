const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('confidence marker targets the sprint label when labels start above zero or have gaps', () => {
    let config;
    function Chart(context, options) { config = options; }
    Chart.defaults = { font: {} };
    const context = vm.createContext({ Chart, document: { getElementById: () => ({ getContext: () => ({}), addEventListener() {} }) } });
    const source = fs.readFileSync(require.resolve('../velocity.js'), 'utf8').replace(/updateSliderValue\(\);\s*runMonteCarlo\(\);\s*$/, '');
    vm.runInContext(source, context);
    vm.runInContext('drawChart("releaseChart", [2, 3, 4, 5, 6, 7, 8, 10], 8, "Release", "Sprints")', context);
    const marker = config.options.plugins.annotation.annotations.confidenceLine;
    assert.equal(marker.xMin, '8');
    assert.equal(marker.xMax, '8');
    assert.equal(config.data.labels.indexOf(marker.xMin), 6);
});
