let chartInstanceVel;
let chartInstanceRel;

Chart.defaults.font.family = "Inter, Arial, Helvetica, sans-serif";
Chart.defaults.color = "#737373";

function updateSliderValue() {
    const slider = document.getElementById("percentageSlider");
    document.getElementById("sliderValue").value = `${slider.value}%`;
    const progress = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background = `linear-gradient(90deg, #c7ff00 0 ${progress}%, #3a404b ${progress}% 100%)`;
}

function calcHowManySprints(backlogSize, velocityDist, useZeroFloor) {
    let remaining = backlogSize;
    let sprints = 0;
    const safetyLimit = 10000;

    while (remaining > 0 && sprints < safetyLimit) {
        const generated = velocityDist.generate();
        remaining -= useZeroFloor ? Math.max(0, generated) : generated;
        sprints++;
    }
    return sprints;
}

function destroyPreviousCharts() {
    if (chartInstanceRel) chartInstanceRel.destroy();
    if (chartInstanceVel) chartInstanceVel.destroy();
    chartInstanceRel = null;
    chartInstanceVel = null;
}

function runMonteCarlo() {
    const velocities = document.getElementById("velocities").value
        .split(",")
        .map(value => Number(value.trim()))
        .filter(Number.isFinite);
    const iterations = Number.parseInt(document.getElementById("iterations").value, 10);
    const confidence = Number(document.getElementById("percentageSlider").value);
    const sprintPlan = Number(document.getElementById("planning").value);
    const backlogSize = Number(document.getElementById("prodBacklog").value);
    const useZeroFloor = document.getElementById("setZero").checked;
    const error = document.getElementById("formError");

    if (velocities.length < 2 || velocities.some(value => value < 0) || iterations <= 0 || sprintPlan < 0 || backlogSize <= 0) {
        error.textContent = "Add at least two valid historic results and positive planning values.";
        return;
    }

    error.textContent = "";
    destroyPreviousCharts();

    const sprintResults = [];
    const releaseResults = [];
    const velocityDist = new NormalDistribution(velocities);
    let planMet = 0;

    for (let i = 0; i < iterations; i++) {
        releaseResults.push(calcHowManySprints(backlogSize, velocityDist, useZeroFloor));
        const sample = useZeroFloor ? Math.max(0, velocityDist.generate()) : velocityDist.generate();
        if (sample >= sprintPlan) planMet++;
        sprintResults.push(sample);
    }

    sprintResults.sort((a, b) => a - b);
    releaseResults.sort((a, b) => a - b);

    const sprintPercentile = sprintResults[Math.floor(iterations * ((100 - confidence) / 100))];
    const deliveryBy = releaseResults[Math.min(iterations - 1, Math.floor(iterations * (confidence / 100)))];
    const planProbability = (planMet / iterations) * 100;

    document.getElementById("planningMetric").textContent = `${formatPercent(planProbability)}%`;
    document.getElementById("planningSuccessProbability").textContent = `chance of completing ${formatNumber(sprintPlan)}+ units`;
    document.getElementById("sprintMetric").textContent = `${formatNumber(sprintPercentile)} units`;
    document.getElementById("sprintResults").textContent = `${confidence}% chance of at least this much`;
    document.getElementById("releaseMetric").textContent = `${Math.ceil(deliveryBy)} sprints`;
    document.getElementById("releaseResults").textContent = `${confidence}% chance of delivery by then`;

    chartInstanceVel = drawChart("velocityChart", sprintResults, sprintPercentile, "Output", "Units");
    chartInstanceRel = drawChart("releaseChart", releaseResults, deliveryBy, "Release", "Sprints");
}

function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPercent(value) {
    return value < 10 ? value.toFixed(1) : Math.round(value);
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
            labels,
            datasets: [
                {
                    label: datasetLabel,
                    type: "bar",
                    data: frequencies,
                    backgroundColor: "rgba(0, 87, 255, .18)",
                    borderColor: "#0057ff",
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
                            xMin: marker,
                            xMax: marker,
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

updateSliderValue();
runMonteCarlo();
