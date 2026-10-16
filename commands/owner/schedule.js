const scheduler = require("../../lib/scheduler");
const session = require("../../lib/session");
const { t } = require("../../lib/lang");

module.exports = {
    name: "schedule",

    description: "Schedule a message to be sent to a WhatsApp group.",

    category: "owner",

    permission: "owner",

    execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const raw = args.join(" ").trim();

        if (raw.toLowerCase() === "help") {
            return sock.sendMessage(jid, {
                text: t(jid, "schedule_help")
            });
        }

        if (!raw) {
            if (jid.endsWith("@g.us")) {
                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_interactive_private")
                });
            }

            session.set(jid, {
                type: "schedule",
                step: "jid",
                expires: Date.now() + 10 * 60 * 1000,
                data: {}
            });

            return sock.sendMessage(jid, {
                text: t(jid, "schedule_step_jid")
            });
        }

        if (raw.toLowerCase() === "list") {
            const schedules = scheduler.list();

            if (!schedules.length) {
                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_list_empty")
                });
            }

            const rows = schedules.map(item =>
                t(jid, "schedule_list_item")
                    .replaceAll("{{id}}", item.id)
                    .replaceAll("{{group}}", item.groupJid)
                    .replaceAll(
                        "{{time}}",
                        new Date(item.runAt).toLocaleString()
                    )
                    .replaceAll(
                        "{{message}}",
                        item.message.length > 100
                            ? item.message.slice(0, 97) + "..."
                            : item.message
                    )
            );

            return sock.sendMessage(jid, {
                text:
                    t(jid, "schedule_list_header") +
                    "\n\n" +
                    rows.join("\n\n")
            });
        }

        if (raw.toLowerCase().startsWith("cancel")) {
            const parts = raw.split(/\s+/);

            if (!parts[1]) {
                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_cancel_usage")
                });
            }

            const cancelled = scheduler.cancel(parts[1]);

            if (!cancelled) {
                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_not_found")
                });
            }

            return sock.sendMessage(jid, {
                text: t(jid, "schedule_cancelled")
                    .replaceAll("{{id}}", cancelled.id)
            });
        }

        // Direct format:
        // .schedule GROUP_JID | YYYY-MM-DD HH:mm | Message
        if (raw.includes("|")) {
            const parts = raw.split("|");

            if (parts.length < 3) {
                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_help")
                });
            }

            const groupJid = parts[0].trim();
            const dateTime = parts[1].trim();
            const message = parts.slice(2).join("|").trim();

            if (!groupJid.endsWith("@g.us")) {
                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_invalid_jid")
                });
            }

            if (!message) {
                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_invalid_message")
                });
            }

            const runAt = scheduler.parseDateTime(dateTime);

            if (runAt === null) {
                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_invalid_datetime")
                });
            }

            if (runAt <= Date.now()) {
                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_past_datetime")
                });
            }

            const item = scheduler.add({
                groupJid,
                message,
                runAt
            });

            return sock.sendMessage(jid, {
                text: t(jid, "schedule_created")
                    .replaceAll("{{id}}", item.id)
                    .replaceAll(
                        "{{time}}",
                        new Date(item.runAt).toLocaleString()
                    )
                    .replaceAll("{{group}}", item.groupJid)
            });
        }

        // Interactive scheduling must start in a private chat.
        if (jid.endsWith("@g.us")) {
            return sock.sendMessage(jid, {
                text: t(jid, "schedule_interactive_private")
            });
        }

        session.set(jid, {
            type: "schedule",
            step: "jid",
            expires: Date.now() + 10 * 60 * 1000,
            data: {}
        });

        return sock.sendMessage(jid, {
            text: t(jid, "schedule_step_jid")
        });
    }
};
