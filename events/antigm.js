const settings = require("../lib/settings");
const { t } = require("../lib/lang");
const identity = require("../lib/identity");

const recent = new Map();
const COOLDOWN_MS = 10000;

module.exports = {
    name: "antigm",
    trigger: "messages.upsert",

    execute: async (sock, msg) => {
        try {
            if (!msg?.message || msg.key?.fromMe) return;

            const jid = msg.key?.remoteJid;
            if (!jid?.endsWith("@g.us")) return;

            // A group Status mention arrives as this message type.
            const mention = msg.message.groupStatusMentionMessage;
            if (!mention) return;

            const config = settings.get(jid);
            if (config.antigm !== true) return;

            const sender = identity.getSender(msg);
            if (!sender) return;

            // Avoid processing the same notification repeatedly.
            const messageId = msg.key?.id || "";
            const cacheKey = `${jid}:${messageId}`;
            if (messageId && recent.has(cacheKey)) return;

            if (messageId) {
                recent.set(cacheKey, Date.now());
                setTimeout(() => recent.delete(cacheKey), COOLDOWN_MS).unref?.();
            }

            const metadata = await sock.groupMetadata(jid);
            const normalize = value =>
                String(value || "").split(":")[0].replace(/@.*$/, "");

            const member = metadata.participants.find(p =>
                normalize(p.id || p.jid) === normalize(sender)
            );

            if (!member) return;

            // Match NEXORA against both its WhatsApp ID and LID.
            const botIds = [
                sock.user?.id,
                sock.user?.lid,
                global.sock?.user?.id,
                global.sock?.user?.lid
            ]
                .filter(Boolean)
                .map(identity.normalize)
                .filter(Boolean);

            const botMember = metadata.participants.find(p => {
                const participantIds = [
                    p.id,
                    p.jid,
                    p.lid
                ]
                    .filter(Boolean)
                    .map(identity.normalize);

                return participantIds.some(id => botIds.includes(id));
            });

            const isAdmin = p =>
                Boolean(p?.admin);

            const action = config.antigm_action || "warn";
            const mentionJid = msg.key.participant || sender + "@s.whatsapp.net";

            if (action === "delete") {
                // Deletes the group notification, not necessarily the original Status.
                await sock.sendMessage(jid, { delete: msg.key });
                await sock.sendMessage(jid, {
                    text: t(jid, "admin.antigm_deleted").replace("{{number}}", sender.split("@")[0]),
                    mentions: [mentionJid]
                });
                return;
            }

            if (action === "kick") {
                if (isAdmin(member)) {
                    await sock.sendMessage(jid, {
                        text: t(jid, "admin.antigm_admin_target")
                    });
                    return;
                }

                if (!isAdmin(botMember)) {
                    await sock.sendMessage(jid, {
                        text: t(jid, "admin.antigm_bot_not_admin")
                    });
                    return;
                }

                await sock.sendMessage(jid, { delete: msg.key });
                await sock.groupParticipantsUpdate(jid, [member.id || member.jid], "remove");
                await sock.sendMessage(jid, {
                    text: t(jid, "admin.antigm_kicked").replace("{{number}}", sender.split("@")[0]),
                    mentions: [mentionJid]
                });
                return;
            }

            // Default action: warn.
            await sock.sendMessage(jid, {
                text: t(jid, "admin.antigm_warning").replace("{{number}}", sender.split("@")[0]),
                mentions: [mentionJid]
            });
        } catch (err) {
            console.error("[ANTIGM] Moderation error:", err?.message || err);
        }
    }
};
