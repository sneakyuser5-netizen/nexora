const fs = require("fs");
const path = require("path");
const { t } = require("../../lib/lang");

module.exports = {

    name: "stats",

    description: "Show bot statistics",

    category: "general",

    permission: "sudo",

    execute: async (sock, msg) => {

        const jid = msg.key.remoteJid;

        const commandsDir = path.join(__dirname, "..");
        const databaseDir = path.join(__dirname, "../../database");

        function countCommands(dir) {

            let total = 0;

            const files = fs.readdirSync(dir);

            for (const file of files) {

                const filePath = path.join(dir, file);

                if (fs.statSync(filePath).isDirectory()) {
                    total += countCommands(filePath);
                } else if (file.endsWith(".js")) {
                    total++;
                }

            }

            return total;

        }

        const commandCount = countCommands(commandsDir);
        const databaseCount = fs.readdirSync(databaseDir).length;

        const uptime = Date.now() - global.START_TIME;

        const seconds = Math.floor(uptime / 1000) % 60;
        const minutes = Math.floor(uptime / 60000) % 60;
        const hours = Math.floor(uptime / 3600000);

        await sock.sendMessage(jid, {
            text:
`${t("general.stats_title")}

📝 ${t("general.stats_commands")}: ${commandCount}
⚡ ${t("general.stats_events")}: 2
💾 ${t("general.stats_database")}: ${databaseCount}

⏱ ${t("general.stats_uptime")}: ${hours}h ${minutes}m ${seconds}s

📦 ${t("general.stats_version")}: ${require("../../package.json").version}`
        });

    }

};
