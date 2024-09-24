
let chartInstanceVel;
let chartInstanceRel;

function updateSliderValue() {
    const slider = document.getElementById('percentageSlider');
    const sliderValue = document.getElementById('sliderValue');
    sliderValue.innerText = slider.value + '%';
}

function calcHowManySprints(prodBacklogSize, velocityDist) {
    let remainingItemstoDeliver = prodBacklogSize;
    let sprintsToDeliver =0;
    while(remainingItemstoDeliver >0){
        remainingItemstoDeliver -= velocityDist.generate();
        sprintsToDeliver ++;
    }
    return sprintsToDeliver;
}

function DestroythePreviousChart(){
    if (chartInstanceRel) {
        chartInstanceRel.destroy();
        chartInstanceRel = null;
    }
    if (chartInstanceVel) {
        chartInstanceVel.destroy();
        chartInstanceVel = null;
    }

    // Remove the canvas element or clear the chart container
    const chartContainers = ['velocityChart', 'releaseChart'];
    chartContainers.forEach(chartID => {
        const chartContainer = document.getElementById(chartID);
        if (chartContainer) {
            chartContainer.innerHTML = ''; // Clear the chart container
        }
    });
}

function runMonteCarlo() {
    const velocitiesInput = document.getElementById("velocities").value;
    const iterations = parseInt(document.getElementById("iterations").value);
    const velocities = velocitiesInput.split(',').map(Number).filter(v => !isNaN(v));
    const percentageConfidence = (100 - document.getElementById("percentageSlider").value) / 100;
    const planningVelocity = parseInt(document.getElementById("planning").value);
    const prodBacklogSize = parseInt(document.getElementById("prodBacklog").value);

    let minVelocityIsZero = false;


    DestroythePreviousChart();


    if (document.getElementById("setZero").checked) {
        minVelocityIsZero = true;
    }

    if (velocities.length === 0 || iterations <= 0) {
        document.getElementById("results").innerText = "Please provide valid velocities and a number of iterations.";
        return;
    }


    const simulatedSprintResults = [];
    const simulatedReleaseResults = [];
    let planningVelocityOrMore = 0;

    const velocityDist = new NormalDistribution(velocities);
    // Generate random samples using normal distribution
    for (let i = 0; i < iterations; i++) {
        simulatedReleaseResults.push(calcHowManySprints(prodBacklogSize,velocityDist));

        let randomSample = velocityDist.generate();
        if (minVelocityIsZero && randomSample < 0) {
            randomSample = 0;
        }
        if (randomSample > planningVelocity) {
            planningVelocityOrMore++;
        }
        simulatedSprintResults.push(randomSample);
    }

    simulatedSprintResults.sort((a, b) => a - b);
    simulatedReleaseResults.sort((a, b) => a - b);

    // Get percentile
    const percentileIndex = Math.floor(iterations * percentageConfidence);
    const percentileValue = simulatedSprintResults[percentileIndex].toFixed(2);

    const percentileRelIndex = Math.floor(iterations * (1-percentageConfidence));
    const deliveryBy = simulatedReleaseResults[percentileRelIndex].toFixed(2);


    document.getElementById("sprintResults").innerText = `${(1 - percentageConfidence) * 100}% chance of: ${percentileValue} or more`;
    document.getElementById("releaseResults").innerText = `${(1 - percentageConfidence) * 100}% chance of delivering by: ${deliveryBy} sprints`;

    document.getElementById("planningSuccessProbability").innerText = `${(planningVelocityOrMore / iterations) * 100}% chance you will get ${planningVelocity} or more items done in a sprint`;

    // Draw the probability distribution chart and the line marking the percentile

    drawVelChart('velocityChart', simulatedSprintResults, percentileValue, percentageConfidence,'distributions of Velocity','velocity');
    drawRelChart('releaseChart', simulatedReleaseResults, deliveryBy, 1-percentageConfidence, 'distribution of total sprints','sprints');
}

function drawVelChart( chartID, data, percentileValue, confidence,chartlabel,xlabel) {
    // Create bins for histogram
    const counts = {};
    data.forEach(function (value) {
        const roundedValue = Math.round(value); // Round to nearest integer for grouping
        counts[roundedValue] = counts[roundedValue] ? counts[roundedValue] + 1 : 1;
    });

    let labels = Object.keys(counts).map(Number); // Convert labels to numbers
    labels.sort((a, b) => a - b); // Sort labels numerically
    const values = labels.map(label => counts[label]); // Re-map values according to sorted labels

    // Find the closest label to the percentile value
    const closestLabel = labels.reduce((prev, curr) =>
        Math.abs(curr - percentileValue) < Math.abs(prev - percentileValue) ? curr : prev
    );

    const closestLabelIndex = labels.indexOf(closestLabel); // Get index of the closest label


    // Compute cumulative frequencies
    const cumulativeFrequencies = [];
    let cumulativeSum = 0;
    values.forEach(function(value) {
        cumulativeSum += value;
        cumulativeFrequencies.push(cumulativeSum);
    });

    // Compute cumulative percentages
    const totalDataPoints = data.length;
    const cumulativePercentageData = cumulativeFrequencies.map(function(cf) {
        return (cf / totalDataPoints) * 100;
    });

    const chartContainer = document.getElementById(chartID);
    chartContainer.innerHTML = `<canvas id= '${chartID}' ></canvas>`;
    const ctx = document.getElementById(chartID).getContext('2d');

    // Create a new Chart
     chartInstanceVel = new Chart(ctx, {
        data: {
            labels: labels,
            datasets: [
                {label: chartlabel,
                    type: 'bar',
                    data: values,
                    backgroundColor: 'rgba(88, 164, 176, 0.2)', // Moonstone color
                    borderColor: 'rgba(88, 164, 176, 1)',
                    borderWidth: 1
                },
                {
                    type: 'line',
                    label: 'Cumulative Percentage',
                    data: cumulativePercentageData,
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    fill: false,
                    yAxisID: 'y1',
                }
            ]

        },
        options: {
            scales: {
                x: {
                    title: {
                        display: true,
                        text: xlabel
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Frequency'
                    },
                    beginAtZero: true
                }
            },
            plugins: {
                annotation: {
                    annotations: {
                        line1: {
                            type: 'line',
                            yMin: 0,
                            yMax: Math.max(...values),
                            xMin: closestLabelIndex,
                            xMax: closestLabelIndex,
                            borderColor: 'red',
                            borderWidth: 2,
                            label: {
                                content: `${(1- confidence) * 100}th Percentile (${percentileValue})`,
                                enabled: true,
                                position: 'top'
                            }
                        }
                    }
                }
            }
        }
    });
}

function drawRelChart(chartID, data, percentileValue, confidence,chartlabel,xlabel) {
    // Create bins for histogram
    const counts = {};
    data.forEach(function (value) {
        const roundedValue = Math.round(value); // Round to nearest integer for grouping
        counts[roundedValue] = counts[roundedValue] ? counts[roundedValue] + 1 : 1;
    });

    let labels = Object.keys(counts).map(Number); // Convert labels to numbers
    labels.sort((a, b) => a - b); // Sort labels numerically
    const values = labels.map(label => counts[label]); // Re-map values according to sorted labels

    // Find the closest label to the percentile value
    const closestLabel = labels.reduce((prev, curr) =>
        Math.abs(curr - percentileValue) < Math.abs(prev - percentileValue) ? curr : prev
    );

    const closestLabelIndex = labels.indexOf(closestLabel); // Get index of the closest label


    // Compute cumulative frequencies
    const cumulativeFrequencies = [];
    let cumulativeSum = 0;
    values.forEach(function(value) {
        cumulativeSum += value;
        cumulativeFrequencies.push(cumulativeSum);
    });

    // Compute cumulative percentages
    const totalDataPoints = data.length;
    const cumulativePercentageData = cumulativeFrequencies.map(function(cf) {
        return (cf / totalDataPoints) * 100;
    });

    const chartContainer = document.getElementById(chartID);
    chartContainer.innerHTML = `<canvas id= '${chartID}' ></canvas>`;
    const ctx = document.getElementById(chartID).getContext('2d');



    // Create a new Chart
     chartInstanceRel = new Chart(ctx, {
        data: {
            labels: labels,
            datasets: [
                {label: chartlabel,
                    type: 'bar',
                    data: values,
                    backgroundColor: 'rgba(88, 164, 176, 0.2)', // Moonstone color
                    borderColor: 'rgba(88, 164, 176, 1)',
                    borderWidth: 1
                },
                {
                    type: 'line',
                    label: 'Cumulative Percentage',
                    data: cumulativePercentageData,
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    fill: false,
                    yAxisID: 'y1',
                }
            ]

        },
        options: {
            scales: {
                x: {
                    title: {
                        display: true,
                        text: xlabel
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Frequency'
                    },
                    beginAtZero: true
                }
            },
            plugins: {
                annotation: {
                    annotations: {
                        line1: {
                            type: 'line',
                            yMin: 0,
                            yMax: Math.max(...values),
                            xMin: closestLabelIndex,
                            xMax: closestLabelIndex,
                            borderColor: 'red',
                            borderWidth: 2,
                            label: {
                                content: `${confidence * 100}th Percentile (${percentileValue})`,
                                enabled: true,
                                position: 'top'
                            }
                        }
                    }
                }
            }
        }
    });
}
