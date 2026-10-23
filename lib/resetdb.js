const fs = require("fs");
const path = require("path");

const databaseDir = path.resolve(__dirname, "../database");
const backupDir = path.join(databaseDir, "backups");

const DEFAULT_SETTINGS = {
    global: {
        autoreact: false,
        autotyping: false,
        autorecording: false,
        autoread: false,
        anticall: false
    }
};

const RESETTABLE = {
    "activity.json": {
        empty: {},
        factory: {}
    },
    "afk.json": {
        empty: {},
        factory: {}
    },
    "edited.json": {
        empty: {},
        factory: {}
    },
    "read.json": {
        empty: {},
        factory: {}
    },
    "sudo.json": {
        empty: {},
        factory: {}
    },
    "command-stats.json": {
        empty: { total: 0, commands: {} },
        factory: { total: 0, commands: {} }
    },
    "scheduled-messages.json": {
        empty: [],
        factory: []
    },
    "settings.json": {
        empty: {},
        factory: DEFAULT_SETTINGS
    }
};

const PROTECTED = [
    "owner.json",
    "setup.json"
];

function list() {
    return {
        resettable: Object.keys(RESETTABLE),
        protected: PROTECTED.slice()
    };
}

function reset(filename, mode) {
    if (!Object.prototype.hasOwnProperty.call(RESETTABLE, filename)) {
        throw new Error("FILE_NOT_ALLOWED");
    }

    if (mode !== "empty" && mode !== "factory") {
        throw new Error("INVALID_MODE");
    }

    const target = path.join(databaseDir, filename);

    if (path.dirname(target) !== databaseDir) {
        throw new Error("FILE_NOT_ALLOWED");
    }

    if (!fs.existsSync(databaseDir)) {
        throw new Error("DATABASE_DIRECTORY_MISSING");
    }

    let existed = fs.existsSync(target);
    let backupPath = null;

    if (existed) {
        // Refuse to overwrite a file that is not valid JSON.
        JSON.parse(fs.readFileSync(target, "utf8"));

        fs.mkdirSync(backupDir, { recursive: true });

        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-");

        backupPath = path.join(
            backupDir,
            `${filename}.${timestamp}.bak`
        );

        fs.copyFileSync(target, backupPath);
    }

    const data = RESETTABLE[filename][mode];
    const output = JSON.stringify(data, null, 2) + "\n";
    const tempPath = path.join(
        databaseDir,
        `.${filename}.${process.pid}.tmp`
    );

    try {
        fs.writeFileSync(tempPath, output, { flag: "wx" });
        fs.renameSync(tempPath, target);
    } catch (error) {
        try {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        } catch (_) {}

        throw error;
    }

    return {
        filename,
        mode,
        backupPath,
        existed
    };
}

module.exports = {
    list,
    reset,
    protected: PROTECTED.slice()
};
