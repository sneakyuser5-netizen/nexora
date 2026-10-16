const { t } = require("../../lib/lang");

module.exports = {
    name: "groups",
    aliases: ["groupjids", "getgroups"],
    description: "List all WhatsApp groups the bot participates in, including their JIDs.",
    category: "owner",
    permission: "owner",

    execute: async (sock, msg) => {
        const jid = msg.key.remoteJid;

        // Protect the group list from being exposed in group chats.
        if (jid.endsWith("@g.us")) {
            return sock.sendMessage(jid, {
                text: t(jid, "groups_private_only")
            });
        }

        try {
            const groups = await sock.groupFetchAllParticipating();

            const entries = Object.entries(groups || {})
                .map(([groupJid, metadata]) => ({
                    jid: groupJid,
                    name: metadata.subject || "Unnamed group"
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            if (!entries.length) {
                return sock.sendMessage(jid, {
                    text: t(jid, "groups_list_empty")
                });
            }

            const maxLength = 3000;
            const chunks = [];
            let currentChunk = "";

            entries.forEach((group, index) => {
                const item = t(jid, "groups_list_item")
                    .replaceAll("{{number}}", String(index + 1))
                    .replaceAll("{{name}}", group.name)
                    .replaceAll("{{jid}}", group.jid);

                if (
                    currentChunk &&
                    currentChunk.length + item.length + 2 > maxLength
                ) {
                    chunks.push(currentChunk);
                    currentChunk = "";
                }

                currentChunk += (currentChunk ? "\n\n" : "") + item;
            });

            if (currentChunk) {
                chunks.push(currentChunk);
            }

            for (let i = 0; i < chunks.length; i++) {
                const header = t(jid, "groups_list_header")
                    .replaceAll("{{count}}", String(entries.length))
                    .replaceAll("{{part}}", String(i + 1))
                    .replaceAll("{{total}}", String(chunks.length));

                await sock.sendMessage(jid, {
                    text: `${header}\n\n${chunks[i]}`
                });
            }
        } catch (error) {
            console.error("[GROUPS] Failed to fetch group list:", error);

            return sock.sendMessage(jid, {
                text: t(jid, "groups_list_error")
            });
        }
    }
};
