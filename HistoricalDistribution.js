// Sample entries with replacement: repeated values retain their observed frequency.
class HistoricalDistribution {
    constructor(data, random = Math.random) {
        this.data = [...data];
        this.random = random;
    }

    generate() {
        return this.data[Math.floor(this.random() * this.data.length)];
    }
}

if (typeof module !== 'undefined') module.exports = HistoricalDistribution;
