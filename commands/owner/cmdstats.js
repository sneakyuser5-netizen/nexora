const { t } = require("../../lib/lang");
const { getStats } = require("../../lib/command-stats");

module.exports = {
    name: "cmdstats",
    aliases: ["commandstats", "commandusage"],
    description: "Show command usage statistics",
    category: "owner",
    permission: "owner",
    usage: ".cmdstats",

    execute: async (sock, msg) => {
        const jid = msg.key.remoteJid;
        const stats = getStats();

        const ranked = Object.entries(stats.commands)
            .filter(([, count]) => Number(count) > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const topCommands = ranked.length
            ? ranked.map(([name, count], index) =>
                `${index + 1}. .${name} — ${count}`
            ).join("\n")
            : t(jid, "owner.cmdstats_empty");

        const message = t(jid, "owner.cmdstats_title")
            .replace("{total}", String(stats.total))
            .replace("{unique}", String(Object.keys(stats.commands).length))
            .replace("{top}", topCommands);

        await sock.sendMessage(jid, { text: message }, { quoted: msg });
    }
};
