function forecastMode() {
    return document.querySelector('input[name="forecastMode"]:checked').value;
}

function forecastUnits() {
    return forecastMode() === 'velocity' ? 'points' : 'issues';
}

function changeForecastMode() {
    const velocity = forecastMode() === 'velocity';
    document.getElementById('jiraStartLabel').textContent = velocity ? 'First sprint starts' : 'First period starts';
    document.getElementById('forecastDaysLabel').textContent = velocity ? 'Sprint duration (days)' : 'Throughput period (days)';
    document.getElementById('historyLabel').textContent = velocity ? 'Historic velocity (points)' : 'Historic throughput (issues)';
    document.getElementById('backlogUnits').textContent = forecastUnits();
    document.getElementById('modeHelp').textContent = velocity ? 'Enter completed story points per sprint and backlog points, or reapply your Jira import.' : 'Enter completed issues per sprint and backlog issue count, or reapply your Jira import.';
    document.getElementById('jiraMeasure').textContent = velocity ? 'Sum story points per sprint using Resolved.' : 'Count issues resolved per sprint using Resolved.';
    document.getElementById('jiraTypesLegend').textContent = `Issue types for ${forecastMode()} and backlog`;
    document.getElementById('jiraUnitsHelp').textContent = velocity ? 'Uses the Story Points or Story point estimate column. Included issues must have a non-negative estimate.' : 'Each issue counts as one, regardless of story points.';
    // Counts and points are different inputs; never silently reinterpret an existing forecast.
    document.getElementById('velocities').value = '';
    document.getElementById('prodBacklog').value = '';
    document.getElementById('jiraSummary').textContent = '';
    document.getElementById('formError').textContent = '';
    destroyPreviousCharts();
    for (const id of ['releaseMetric']) document.getElementById(id).textContent = '—';
    for (const id of ['releaseResults']) document.getElementById(id).textContent = 'Enter data and run forecast';
}

let chartInstanceRel;
let releaseHorizonPeriods = null;

function updateReleaseHorizon() {
    if (releaseHorizonPeriods === null) return;
    const days = Number(document.getElementById("forecastDays").value);
    const valid = Number.isInteger(days) && days >= 1 && days <= 365;
    const weeks = valid ? Math.ceil(releaseHorizonPeriods * days / 7 * 10) / 10 : null;
    document.getElementById("releaseMetric").textContent = weeks === null ? "—" : `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}


Chart.defaults.font.family = "Inter, Arial, Helvetica, sans-serif";
Chart.defaults.color = "#737373";

function updateSliderValue() {
    const slider = document.getElementById("percentageSlider");
    document.getElementById("sliderValue").value = `${slider.value}%`;
    const progress = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background = `linear-gradient(90deg, #c7ff00 0 ${progress}%, #3a404b ${progress}% 100%)`;
}

function calcHowManySprints(backlogSize, velocityDist) {
    let remaining = backlogSize;
    let sprints = 0;
    const safetyLimit = 10000;

    while (remaining > 0 && sprints < safetyLimit) {
        const generated = velocityDist.generate();
        remaining -= Math.max(0, generated);
        sprints++;
    }
    return sprints;
}

function destroyPreviousCharts() {
    if (chartInstanceRel) chartInstanceRel.destroy();
    chartInstanceRel = null;
    releaseHorizonPeriods = null;
    setCalendarResults([]);
}

function changeSimulationModel() {
    const historical = document.getElementById('simulationModel').value === 'historical';
    document.getElementById('modelHelp').textContent = historical
        ? 'Rolls one face per historical entry for every simulated period. Entries are equally likely, duplicates retain their frequency, and each draw is independent.'
        : 'Generates values from a normal distribution fitted to your history. Negative results count as zero.';
    destroyPreviousCharts();
    document.getElementById('modelLabel').textContent = historical ? 'Historical sampling model' : 'Normal distribution model';
    document.getElementById('releaseMetric').textContent = '—';
    document.getElementById('releaseResults').textContent = 'Run forecast with the selected model';
    document.getElementById('formError').textContent = '';
}

function runMonteCarlo() {
    const velocities = document.getElementById("velocities").value
        .split(",")
        .filter(value => value.trim() !== "")
        .map(value => Number(value.trim()))
        .filter(Number.isFinite);
    const iterations = Number.parseInt(document.getElementById("iterations").value, 10);
    const confidence = Number(document.getElementById("percentageSlider").value);
    const backlogSize = Number(document.getElementById("prodBacklog").value);
    const error = document.getElementById("formError");

    if (velocities.length < 2 || velocities.some(value => value < 0) || iterations <= 0 || document.getElementById("prodBacklog").value.trim() === "" || !Number.isFinite(backlogSize) || backlogSize < 0) {
        error.textContent = "Add at least two valid historic results, positive simulations and a non-negative backlog.";
        return;
    }

    if (!velocities.some(value => value > 0)) {
        error.textContent = "No completed work in this history. Include resolved issues or choose a different date range.";
        return;
    }

    error.textContent = "";
    destroyPreviousCharts();

    const releaseResults = [];
    const historical = document.getElementById('simulationModel').value === 'historical';
    const velocityDist = historical ? new HistoricalDistribution(velocities) : new NormalDistribution(velocities);
    document.getElementById('modelLabel').textContent = historical ? 'Historical sampling model' : 'Normal distribution model';

    for (let i = 0; i < iterations; i++) {
        releaseResults.push(calcHowManySprints(backlogSize, velocityDist));
    }

    releaseResults.sort((a, b) => a - b);

    const deliveryBy = releaseResults[Math.min(iterations - 1, Math.floor(iterations * (confidence / 100)))];

    releaseHorizonPeriods = deliveryBy;
    updateReleaseHorizon();
    document.getElementById("releaseResults").textContent = `${confidence}% chance of delivery by then`;

    chartInstanceRel = drawChart("releaseChart", releaseResults, deliveryBy, "Release", "Sprints");
    setCalendarResults(releaseResults);
}

function probabilityBarColours(cumulative, enabled) {
    const colours = cumulative.map(value => value > 85 ? "#15803d" : value >= 50 ? "#b77900" : "#dc2626");
    return enabled
        ? { backgroundColor: colours.map(colour => `${colour}40`), borderColor: colours }
        : { backgroundColor: "rgba(115, 123, 91, .22)", borderColor: "#737b5b" };
}

function updateChartColours() {
    const enabled = document.getElementById("chartColours").checked;
    document.getElementById("chartColourLegend").hidden = !enabled;
    for (const chart of [chartInstanceRel]) {
        if (!chart) continue;
        Object.assign(chart.data.datasets[0], probabilityBarColours(chart.data.datasets[1].data, enabled));
        chart.update('none');
    }
}

function drawChart(chartId, data, percentileValue, datasetLabel, xLabel) {
    const counts = {};
    data.forEach(value => {
        const rounded = Math.max(0, Math.round(value));
        counts[rounded] = (counts[rounded] || 0) + 1;
    });

    const labels = Object.keys(counts).map(Number).sort((a, b) => a - b);
    const frequencies = labels.map(label => counts[label]);
    const cumulative = [];
    let runningTotal = 0;
    frequencies.forEach(value => {
        runningTotal += value;
        cumulative.push((runningTotal / data.length) * 100);
    });

    const marker = labels.reduce((closest, current) =>
        Math.abs(current - percentileValue) < Math.abs(closest - percentileValue) ? current : closest
    );

    return new Chart(document.getElementById(chartId).getContext("2d"), {
        data: {
            labels: labels.map(String),
            datasets: [
                {
                    label: datasetLabel,
                    type: "bar",
                    data: frequencies,
                    ...probabilityBarColours(cumulative, document.getElementById("chartColours").checked),
                    borderWidth: 1,
                    borderRadius: 2,
                    yAxisID: "y"
                },
                {
                    label: "Cumulative %",
                    type: "line",
                    data: cumulative,
                    borderColor: "#ff3d00",
                    backgroundColor: "#ff3d00",
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: .28,
                    yAxisID: "y1"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 350 },
            interaction: { intersect: false, mode: "index" },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    title: { display: true, text: xLabel, font: { size: 9, weight: "600" } },
                    ticks: { font: { size: 8 }, maxTicksLimit: 12 }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: "#e9e9e9" },
                    border: { display: false },
                    ticks: { display: false }
                },
                y1: {
                    beginAtZero: true,
                    max: 100,
                    position: "right",
                    grid: { display: false },
                    border: { display: false },
                    ticks: { callback: value => `${value}%`, font: { size: 8 }, maxTicksLimit: 5 }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { displayColors: false, padding: 9 },
                annotation: {
                    annotations: {
                        confidenceLine: {
                            type: "line",
                            // Category axes interpret numbers as indices, not label values.
                            xMin: String(marker),
                            xMax: String(marker),
                            borderColor: "#191715",
                            borderWidth: 1,
                            borderDash: [4, 4]
                        }
                    }
                }
            }
        }
    });
}

document.getElementById("forecastDays").addEventListener("input", updateReleaseHorizon);
updateSliderValue();
runMonteCarlo();
