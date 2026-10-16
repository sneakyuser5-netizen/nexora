const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(
    __dirname,
    "..",
    "database",
    "scheduled-messages.json"
);

const MAX_LATE_MS = 10 * 60 * 1000;

let activeSock = null;
let timer = null;
let processing = false;

function readSchedules() {
    if (!fs.existsSync(DATA_FILE)) {
        return [];
    }

    try {
        const data = JSON.parse(
            fs.readFileSync(DATA_FILE, "utf8")
        );

        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("[SCHEDULER] Could not read schedule database:", error.message);
        return [];
    }
}

function writeSchedules(schedules) {
    fs.mkdirSync(path.dirname(DATA_FILE), {
        recursive: true
    });

    const tempFile = DATA_FILE + ".tmp";

    fs.writeFileSync(
        tempFile,
        JSON.stringify(schedules, null, 2),
        "utf8"
    );

    fs.renameSync(tempFile, DATA_FILE);
}

function parseDateTime(value) {
    const match = String(value).trim().match(
        /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/
    );

    if (!match) {
        return null;
    }

    const [, year, month, day, hour, minute] =
        match.map(Number);

    const date = new Date(
        year,
        month - 1,
        day,
        hour,
        minute,
        0,
        0
    );

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== minute
    ) {
        return null;
    }

    return date.getTime();
}

function add({ groupJid, message, runAt }) {
    const schedules = readSchedules();

    const item = {
        id: "SC" + Date.now().toString(36).toUpperCase(),
        groupJid,
        message,
        runAt,
        status: "pending",
        createdAt: Date.now()
    };

    schedules.push(item);
    writeSchedules(schedules);

    return item;
}

function list() {
    return readSchedules()
        .filter(item => item.status === "pending")
        .sort((a, b) => a.runAt - b.runAt);
}

function cancel(id) {
    const schedules = readSchedules();

    const item = schedules.find(
        entry =>
            entry.status === "pending" &&
            entry.id.toLowerCase() === String(id).toLowerCase()
    );

    if (!item) {
        return null;
    }

    item.status = "cancelled";
    item.cancelledAt = Date.now();

    writeSchedules(schedules);

    return item;
}

async function processDue() {
    if (!activeSock || processing) {
        return;
    }

    processing = true;

    try {
        const schedules = readSchedules();
        const now = Date.now();
        let changed = false;

        for (const item of schedules) {
            if (item.status !== "pending" || item.runAt > now) {
                continue;
            }

            if (now - item.runAt > MAX_LATE_MS) {
                item.status = "expired";
                item.expiredAt = now;
                changed = true;

                console.log(
                    `[SCHEDULER] Schedule ${item.id} expired because it was overdue.`
                );

                continue;
            }

            try {
                await activeSock.sendMessage(item.groupJid, {
                    text: item.message
                });

                item.status = "sent";
                item.sentAt = Date.now();
                changed = true;

                console.log(
                    `[SCHEDULER] Delivered scheduled message ${item.id}.`
                );
            } catch (error) {
                // Keep it pending so a temporary connection failure
                // does not immediately lose the scheduled message.
                if (
                    !item.lastErrorAt ||
                    now - item.lastErrorAt >= 60000
                ) {
                    console.error(
                        `[SCHEDULER] Delivery attempt failed for ${item.id}:`,
                        error.message
                    );

                    item.lastErrorAt = now;
                    changed = true;
                }
            }
        }

        if (changed) {
            writeSchedules(schedules);
        }
    } catch (error) {
        console.error("[SCHEDULER] Processing error:", error.message);
    } finally {
        processing = false;
    }
}

function start(sock) {
    activeSock = sock;

    if (timer) {
        return;
    }

    console.log("[SCHEDULER] Scheduler started.");

    timer = setInterval(() => {
        processDue().catch(error => {
            console.error("[SCHEDULER]", error.message);
        });
    }, 5000);

    if (typeof timer.unref === "function") {
        timer.unref();
    }

    processDue().catch(error => {
        console.error("[SCHEDULER]", error.message);
    });
}

module.exports = {
    add,
    list,
    cancel,
    start,
    parseDateTime
};
