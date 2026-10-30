const settings = require("../lib/settings");
const { t } = require("../lib/lang");
const identity = require("../lib/identity");

module.exports = {
    name: "moderation",
    trigger: "messages.upsert",

    execute: async (sock, msg) => {
        if (!msg.message) return;

        if (msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        if (!jid.endsWith("@g.us")) return;

        const groupSettings = settings.get(jid);
        global.slowmode = global.slowmode || {}; // init

        const lockedTypes = {
            sticker: msg.message.stickerMessage,
            image: msg.message.imageMessage,
            video: msg.message.videoMessage,
            audio: msg.message.audioMessage,
            document: msg.message.documentMessage,
            poll: msg.message.pollCreationMessage
        };

        let locked = null;
        for (const type in lockedTypes) {
            if (lockedTypes[type] && groupSettings["lock_" + type]) {
                locked = type;
                break;
            }
        }

        // ===== SLOWMODE =====
        const delay = groupSettings.slowmode || 0;
        if (delay > 0) {
            const sender = identity.getSender(msg);
            const metadata = await sock.groupMetadata(jid);
            const member = metadata.participants.find(p => {
                const id = identity.normalize(p.id || "");
                return id === sender;
            });

            if (member?.admin) return; // admins bypass

            const now = Date.now();
            const key = jid + ":" + sender;
            const last = global.slowmode[key] || 0;

            if (now - last < delay * 1000) {
                const remaining = Math.ceil((delay * 1000 - (now - last)) / 1000);

                // delete spam message
                await sock.sendMessage(jid, { delete: msg.key });

                // get better name for mention
                const mentionJid = msg.key.participant || msg.key.remoteJid;
                const contact = sock.contacts?.[mentionJid] || {};
                const name =
                    contact.name ||
                    contact.notify ||
                    contact.verifiedName ||
                    mentionJid.split("@")[0];

                return sock.sendMessage(jid, {
                    text: `🐢 ${t("admin.slowmode_trigger_prefix")} @${name}!\n\n😂 ${t("admin.slowmode_trigger_msg1")} ${delay}s.\n${t("admin.slowmode_trigger_msg2")} ${remaining}s.`,
                    mentions: [mentionJid]
                });
            }
            global.slowmode[key] = now;
        }

        // ===== LOCKED TYPES =====
        if (!locked) return;

        try {
            const metadata = await sock.groupMetadata(jid);
            const sender = msg.key.participant;
            const member = metadata.participants.find(p => {
                const id = (p.id || p.jid || "").split(":")[0];
                return id === sender.split(":")[0];
            });

            if (member?.admin) return;

            await sock.sendMessage(jid, { delete: msg.key });
            await sock.sendMessage(jid, {
                text: t(jid, "message_type_locked").replace("{type}", locked)
            });

        } catch (err) {
            console.log("Moderation error:", err);
        }
    }
};
