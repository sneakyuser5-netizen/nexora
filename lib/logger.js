const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "..", "database", "nexora.log");
const MAX_BYTES = 1024 * 1024;
const KEEP_BYTES = 512 * 1024;

function safeText(value) {
    if (value instanceof Error) {
        return value.stack || value.message;
    }

    if (typeof value === "string") {
        // Never persist serialized WhatsApp message/event data.
        if (
            value.includes('"messageSecret"') ||
            value.includes('"senderKeyDistributionMessage"') ||
            (
                value.includes('"remoteJid"') &&
                value.includes('"message"') &&
                value.includes('"key"')
            )
        ) {
            return "[REDACTED: WhatsApp message/event data]";
        }

        return value;
    }

    if (value === null || value === undefined) {
        return String(value);
    }

    return `[${typeof value}]`;
}

function write(level, args) {
    try {
        fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

        const timestamp = new Date().toISOString();
        const message = args.map(safeText).join(" ");
        const entry = `[${timestamp}] [${level}] ${message.replace(/\r?\n/g, " ")}\n`;

        if (fs.existsSync(LOG_FILE) &&
            fs.statSync(LOG_FILE).size >= MAX_BYTES) {
            const content = fs.readFileSync(LOG_FILE);
            const remaining = content.subarray(Math.max(0, content.length - KEEP_BYTES));
            fs.writeFileSync(LOG_FILE, remaining);
        }

        fs.appendFileSync(LOG_FILE, entry, { mode: 0o600 });
    } catch (error) {
        // Logging must never crash the bot.
    }
}

function getRecentLines(count = 20, level = "all") {
    if (!fs.existsSync(LOG_FILE)) return [];

    const safeCount = Math.max(1, Math.min(100, Number(count) || 20));
    const lines = fs.readFileSync(LOG_FILE, "utf8")
        .split(/\r?\n/)
        .filter(Boolean);

    const filtered = level === "errors"
        ? lines.filter(line => /\[(ERROR|WARN)\]/.test(line))
        : lines;

    return filtered.slice(-safeCount);
}

module.exports = {
    log: (...args) => write("INFO", args),
    warn: (...args) => write("WARN", args),
    error: (...args) => write("ERROR", args),
    getRecentLines,
    LOG_FILE
};
