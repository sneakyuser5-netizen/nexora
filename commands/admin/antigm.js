const { t } = require("../../lib/lang");
const settings = require("../../lib/settings");

const ACTIONS = ["warn", "delete", "kick"];

module.exports = {
  name: "antigm",
  description: "Configure anti-group-mention moderation",
  category: "admin",
  permission: "admin",
  usage: ".antigm on/off/status | action warn/delete/kick",
  minArgs: 1,

  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;

    if (!jid || !jid.endsWith("@g.us")) {
      return sock.sendMessage(jid, {
        text: t(jid, "group_only")
      });
    }

    const option = args[0]?.toLowerCase();
    const group = settings.get(jid);

    if (option === "on" || option === "off") {
      settings.set(jid, "antigm", option === "on");

      return sock.sendMessage(jid, {
        text: option === "on"
          ? t(jid, "admin.antigm_enabled")
          : t(jid, "admin.antigm_disabled")
      });
    }

    if (option === "action") {
      const action = args[1]?.toLowerCase();

      if (!ACTIONS.includes(action)) {
        return sock.sendMessage(jid, {
          text: t(jid, "admin.antigm_action_usage")
        });
      }

      settings.set(jid, "antigm_action", action);

      return sock.sendMessage(jid, {
        text: t(jid, "admin.antigm_action_set").replace("{{action}}", action)
      });
    }

    if (option === "status") {
      const enabled = group.antigm === true;
      const action = group.antigm_action || "warn";

      return sock.sendMessage(jid, {
        text: [
          t(jid, "admin.antigm_status_title"),
          "",
          t(jid, enabled ? "admin.antigm_enabled_yes" : "admin.antigm_enabled_no"),
          t(jid, "admin.antigm_action_label").replace("{{action}}", action),
          "",
          "Commands:",
          ".antigm on",
          ".antigm off",
          ".antigm action warn",
          ".antigm action delete",
          ".antigm action kick",
          ".antigm status"
        ].join("\n")
      });
    }

    return sock.sendMessage(jid, {
      text: t(jid, "admin.antigm_usage")
    });
  }
};
