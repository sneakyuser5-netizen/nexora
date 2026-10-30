const settings = require("../../lib/settings");
const { t } = require("../../lib/lang");

module.exports = {

    name: "settings",

    description: "Show current group settings",

    category: "admin",

    permission: "admin",

    execute: async (sock, msg) => {

        const jid = msg.key.remoteJid;

        if (!jid?.endsWith("@g.us")) {
            return sock.sendMessage(jid, {
                text: t(jid, "admin.only_groups")
            });
        }

        const group = settings.get(jid);
        const global = settings.get("global");

        const on = t(jid, "admin.settings_on");
        const off = t(jid, "admin.settings_off");

        const status = value => value ? on : off;

const antiLinkDisplay = group.antilink
    ? `ON (${(group.antilink_action || "delete").toUpperCase()})`
    : off;
        const slowmode =
            Number(group.slowmode) > 0
                ? `${group.slowmode}s`
                : off;

        const prefix = group.prefix || ".";

        const features = [
            group.adminonly,
            group.lock_image,
            group.antilink,
            group.antigm,
            group.aifilter,
            group.ai,
            group.autoreact,
            group.autogoodnight,
            group.welcome,
            group.goodbye,
            Number(group.slowmode) > 0
        ];

        const enabledCount = features.filter(Boolean).length;
        const disabledCount = features.length - enabledCount;

        const botName = global.bot_name || "NEXORA";

        const text = `
╭━━━〔 ⚙️ ${t(jid, "admin.settings_header")} 〕━━━╮

🛡️ *${t(jid, "admin.settings_security")}*

🔒 ${t(jid, "admin.settings_adminonly_label")} : ${status(group.adminonly)}
🔗 ${t(jid, "admin.settings_antilink_label")} : ${antiLinkDisplay}
🛡️ ${t(jid, "admin.settings_antigm_label")} : ${status(group.antigm)}
⚙️ ${t(jid, "admin.settings_antigm_action_label")} : ${(group.antigm_action || "warn").toUpperCase()}
🖼️ ${t(jid, "admin.settings_imagelock_label")} : ${status(group.lock_image)}
🤖 ${t(jid, "admin.settings_aifilter_label")} : ${status(group.aifilter)}

🤖 *${t(jid, "admin.settings_ai_section")}*

🧠 ${t(jid, "admin.settings_ai_label")} : ${status(group.ai)}

⚡ *${t(jid, "admin.settings_automation")}*

❤️ ${t(jid, "admin.settings_autoreact_label")} : ${status(group.autoreact)}
🌙 ${t(jid, "admin.settings_autogoodnight_label")} : ${status(group.autogoodnight)}

👥 *${t(jid, "admin.settings_group_section")}*

👋 ${t(jid, "admin.settings_welcome_label")} : ${status(group.welcome)}
👋 ${t(jid, "admin.settings_goodbye_label")} : ${status(group.goodbye)}
🐌 ${t(jid, "admin.settings_slowmode_label")} : ${slowmode}

⚙️ *${t(jid, "admin.settings_bot_section")}*

🔣 ${t(jid, "admin.settings_prefix_label")} : ${prefix}
🤖 ${t(jid, "admin.settings_botname_label")} : ${botName}

📊 *${t(jid, "admin.settings_summary")}*

✅ ${t(jid, "admin.settings_enabled")} : ${enabledCount}
❌ ${t(jid, "admin.settings_disabled")} : ${disabledCount}

╰━━━━━━━━━━━━━━━━━━━━━━╯
`.trim();

        return sock.sendMessage(jid, { text });
    }
};
