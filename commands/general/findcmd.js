const fs = require("fs");
const path = require("path");
const { t } = require("../../lib/lang");

const COMMANDS_DIR = path.join(__dirname, "..");

function collectCommands(directory) {
    const results = [];

    if (!fs.existsSync(directory)) return results;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            results.push(...collectCommands(fullPath));
            continue;
        }

        if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

        try {
            delete require.cache[require.resolve(fullPath)];
            const command = require(fullPath);

            if (!command || typeof command.execute !== "function" || !command.name) {
                continue;
            }

            results.push({
                name: String(command.name),
                aliases: Array.isArray(command.aliases) ? command.aliases : [],
                description: String(command.description || ""),
                usage: String(command.usage || ""),
                category: String(command.category || path.basename(directory)),
                file: fullPath
            });
        } catch (error) {
            console.error(
                `[FINDCMD] Could not inspect ${entry.name}:`,
                error.message
            );
        }
    }

    return results;
}

function normalize(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function scoreCommand(command, query) {
    const normalizedQuery = normalize(query);
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);

    if (!terms.length) return 0;

    const name = normalize(command.name);
    const aliases = command.aliases.map(normalize);
    const description = normalize(command.description);
    const usage = normalize(command.usage);
    const category = normalize(command.category);
    const searchable = `${name} ${aliases.join(" ")} ${description} ${usage} ${category}`;

    let score = 0;

    if (name === normalizedQuery) score += 15;
    if (aliases.includes(normalizedQuery)) score += 12;
    if (description.includes(normalizedQuery)) score += 8;
    if (usage.includes(normalizedQuery)) score += 6;

    for (const term of terms) {
        if (name.split(" ").includes(term)) score += 5;
        else if (name.includes(term)) score += 3;

        if (aliases.some(alias => alias.split(" ").includes(term))) score += 4;
        else if (aliases.some(alias => alias.includes(term))) score += 2;

        if (description.includes(term)) score += 3;
        if (usage.includes(term)) score += 2;
        if (category.includes(term)) score += 1;
        if (searchable.includes(term)) score += 1;
    }

    const matchedTerms = terms.filter(term => searchable.includes(term)).length;

    if (matchedTerms === terms.length) score += 5;

    return score;
}

module.exports = {
    name: "findcmd",
    aliases: ["commandfinder", "searchcmd"],
    description: "Search available commands by describing what you want to do.",
    category: "general",
    permission: "all",
    usage: ".findcmd <what you want to do>",

    execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const query = args.join(" ").trim();

        if (!query) {
            return sock.sendMessage(jid, {
                text: t(jid, "general.findcmd_usage")
            }, { quoted: msg });
        }

        const commands = collectCommands(COMMANDS_DIR)
            .filter(command => command.name.toLowerCase() !== "findcmd");

        const matches = commands
            .map(command => ({
                ...command,
                score: scoreCommand(command, query)
            }))
            .filter(command => command.score > 0)
            .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
            .slice(0, 8);

        if (!matches.length) {
            return sock.sendMessage(jid, {
                text: t(jid, "general.findcmd_none")
                    .replace("{query}", query)
            }, { quoted: msg });
        }

        const resultLines = matches.map((command, index) => {
            const description = command.description || "No description available";
            const usage = command.usage ? `\n│  └─ Usage: ${command.usage}` : "";

            return `${index + 1}. *.${command.name}*\n│  ├─ ${description}${usage}`;
        });

        const text = t(jid, "general.findcmd_results")
            .replace("{query}", query)
            .replace("{results}", resultLines.join("\n│\n"));

        return sock.sendMessage(jid, {
            text
        }, { quoted: msg });
    }
};
