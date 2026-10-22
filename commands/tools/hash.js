const crypto = require("crypto");
const { t } = require("../../lib/lang");

const ALGORITHMS = {
    sha256: "sha256",
    sha512: "sha512"
};

module.exports = {
    name: "hash",
    aliases: ["hasher"],
    description: "Generate SHA-256 or SHA-512 hashes",
    category: "tools",
    permission: "sudo",
    usage: ".hash [sha256|sha512] <text>",

    execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;

        if (!args.length) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.hash_usage")
            }, { quoted: msg });
        }

        let algorithm = "sha256";
        let inputArgs = args;

        if (/^sha(?:256|512)$/i.test(args[0])) {
            algorithm = args[0].toLowerCase();
            inputArgs = args.slice(1);
        }

        if (!inputArgs.length) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.hash_usage")
            }, { quoted: msg });
        }

        const input = inputArgs.join(" ");

        if (Buffer.byteLength(input, "utf8") > 10000) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.hash_too_long")
            }, { quoted: msg });
        }

        const digest = crypto
            .createHash(ALGORITHMS[algorithm])
            .update(input, "utf8")
            .digest("hex");

        return sock.sendMessage(jid, {
            text:
                `🔐 *${t(jid, "tools.hash_title")}*\n\n` +
                `╭─「 𝗔𝗟𝗚𝗢𝗥𝗜𝗧𝗛𝗠 」\n` +
                `│ ${algorithm.toUpperCase()}\n` +
                `╰──────────────\n\n` +
                `╭─「 𝗛𝗔𝗦𝗛 」\n` +
                `│ ${digest}\n` +
                `╰──────────────\n\n` +
                `📏 ${digest.length} ${t(jid, "tools.hash_characters")}\n` +
                `🛡️ ${t(jid, "tools.hash_note")}`
        }, { quoted: msg });
    }
};
