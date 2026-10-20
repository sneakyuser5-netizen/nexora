const { t } = require("../../lib/lang");

module.exports = {
    name: "poll",
    aliases: ["vote"],
    category: "tools",
    description: "Create a native WhatsApp poll",
    usage: ".poll <question> | <option 1> | <option 2> | ...",
    permission: "all",

    execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const input = args.join(" ").trim();

        const reply = async (key) =>
            sock.sendMessage(
                jid,
                { text: t(jid, key) },
                { quoted: msg }
            );

        if (!input.includes("|")) {
            return reply("tools.poll_usage");
        }

        const parts = input.split("|").map(part => part.trim());

        const question = parts.shift();

        let multiple = false;

        if (parts.length > 0 && parts[parts.length - 1].toLowerCase() === "multiple") {
            multiple = true;
            parts.pop();
        }

        const options = parts.filter(Boolean);

        if (!question || question.length > 240) {
            return reply("tools.poll_invalid_question");
        }

        if (options.length < 2 || options.length > 12) {
            return reply("tools.poll_invalid_options");
        }

        if (options.some(option => option.length > 100)) {
            return reply("tools.poll_option_too_long");
        }

        const normalized = options.map(option =>
            option.normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
        );

        if (new Set(normalized).size !== normalized.length) {
            return reply("tools.poll_duplicate_options");
        }

        try {
            await sock.sendMessage(jid, {
                poll: {
                    name: question,
                    values: options,
                    selectableCount: multiple ? options.length : 1
                }
            });
        } catch (error) {
            console.error("[POLL] Failed to create poll:", error.message);
            return reply("tools.poll_failed");
        }
    }
};
