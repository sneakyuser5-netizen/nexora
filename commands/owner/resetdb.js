const session = require("../../lib/session");
const resetdb = require("../../lib/resetdb");
const { t } = require("../../lib/lang");

module.exports = {
    name: "resetdb",
    description: "Safely reset supported database files",
    category: "owner",
    permission: "owner",
    usage: ".resetdb list | .resetdb <file> <empty|factory>",

    execute: async (sock, msg, args = []) => {
        const jid = msg.key.remoteJid;
        const action = String(args[0] || "").toLowerCase();

        if (action === "list") {
            const files = resetdb.list();

            const text =
                `${t(jid, "owner.resetdb_title")}\n\n` +
                `${t(jid, "owner.resetdb_available")}\n` +
                files.resettable.map(file => `• ${file}`).join("\n") +
                `\n\n${t(jid, "owner.resetdb_protected")}\n` +
                files.protected.map(file => `🔒 ${file}`).join("\n") +
                `\n\n${t(jid, "owner.resetdb_list_footer")}`;

            return sock.sendMessage(jid, { text }, { quoted: msg });
        }

        const filename = String(args[0] || "");
        const mode = String(args[1] || "").toLowerCase();

        const files = resetdb.list();

        if (
            !files.resettable.includes(filename) ||
            !["empty", "factory"].includes(mode)
        ) {
            return sock.sendMessage(jid, {
                text: t(jid, "owner.resetdb_usage")
            }, { quoted: msg });
        }

        const existing = session.get(jid);

        if (existing?.type === "resetdb") {
            session.delete(jid);
        }

        session.set(jid, {
            type: "resetdb",
            file: filename,
            mode,
            expires: Date.now() + 60 * 1000
        });

        return sock.sendMessage(jid, {
            text: t(jid, "owner.resetdb_confirm")
                .replaceAll("{{file}}", filename)
                .replaceAll("{{mode}}", mode)
        }, { quoted: msg });
    }
};
