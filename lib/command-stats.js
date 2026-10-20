const fs = require("fs");
const path = require("path");

const DATABASE_DIR = path.join(__dirname, "..", "database");
const STATS_FILE = path.join(DATABASE_DIR, "command-stats.json");

function readStats() {
    try {
        if (!fs.existsSync(STATS_FILE)) {
            return { total: 0, commands: {} };
        }

        const data = JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));

        return {
            total: Number(data.total) || 0,
            commands: data.commands && typeof data.commands === "object"
                ? data.commands
                : {}
        };
    } catch (error) {
        console.error("[CMDSTATS] Failed to read statistics:", error.message);
        return { total: 0, commands: {} };
    }
}

function saveStats(stats) {
    try {
        fs.mkdirSync(DATABASE_DIR, { recursive: true });

        const tempFile = `${STATS_FILE}.tmp`;

        fs.writeFileSync(tempFile, JSON.stringify(stats, null, 2));
        fs.renameSync(tempFile, STATS_FILE);

        return true;
    } catch (error) {
        console.error("[CMDSTATS] Failed to save statistics:", error.message);
        return false;
    }
}

function recordCommand(commandName) {
    if (!commandName || typeof commandName !== "string") return;

    const stats = readStats();
    const name = commandName.toLowerCase();

    stats.total += 1;

    if (!stats.commands[name]) {
        stats.commands[name] = 0;
    }

    stats.commands[name] += 1;

    saveStats(stats);
}

function getStats() {
    return readStats();
}

module.exports = {
    recordCommand,
    getStats
};
