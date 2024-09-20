// NormalDistribution.js
class NormalDistribution {
    constructor(data) {
        this.mean = NormalDistribution.calculateMean(data);
        this.standardDeviation = NormalDistribution.calculateStandardDeviation(data);
    }

    static calculateMean(data) {
        const sum = data.reduce((a, b) => a + b, 0);
        return sum / data.length;
    }
    static calculateStandardDeviation(data) {
        const mean = NormalDistribution.calculateMean(data);
        const squareDiffs = data.map(value => Math.pow(value - mean, 2));
        const avgSquareDiff = NormalDistribution.calculateMean(squareDiffs);
        return Math.sqrt(avgSquareDiff);
    }
    // Method to generate a random number based on normal distribution
    generate() {
        // Using Box-Muller transform to generate a pair of independent standard normal random variables
        let u1 = Math.random();
        let u2 = Math.random();

        let z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

        // Scale and shift the result to match the desired mean and standard deviation
        return z0 * this.standardDeviation + this.mean;
    }
}

// Export the class to make it available for import in other files
//export default NormalDistribution;
