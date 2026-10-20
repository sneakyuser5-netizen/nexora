const crypto = require("crypto");
const { t } = require("../../lib/lang");

const MIN_LENGTH = 8;
const MAX_LENGTH = 64;

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}?";

function generatePassword(length) {
    const groups = [UPPER, LOWER, DIGITS, SYMBOLS];
    const password = groups.map(group =>
        group[crypto.randomInt(group.length)]
    );

    const all = groups.join("");

    while (password.length < length) {
        password.push(all[crypto.randomInt(all.length)]);
    }

    // Securely shuffle the characters.
    for (let i = password.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [password[i], password[j]] = [password[j], password[i]];
    }

    return password.join("");
}

module.exports = {
    name: "password",
    aliases: ["passgen"],
    description: "Generate a secure random password",
    category: "tools",
    permission: "sudo",
    usage: ".password [length]",

    execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;

        if (args.length > 1) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.password_usage")
            }, { quoted: msg });
        }

        const input = args[0] || "16";

        if (!/^\d+$/.test(input)) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.password_invalid")
            }, { quoted: msg });
        }

        const length = Number(input);

        if (length < MIN_LENGTH || length > MAX_LENGTH) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.password_range")
            }, { quoted: msg });
        }

        const password = generatePassword(length);

        return sock.sendMessage(jid, {
            text:
                `🔐 *${t(jid, "tools.password_title")}*\n\n` +
                `╭─「 𝗣𝗔𝗦𝗦𝗪𝗢𝗥𝗗 」\n` +
                `│ ${password}\n` +
                `╰──────────────\n\n` +
                `📏 ${length} characters\n` +
                `🛡️ ${t(jid, "tools.password_secure")}`
        }, { quoted: msg });
    },

    generatePassword
};
