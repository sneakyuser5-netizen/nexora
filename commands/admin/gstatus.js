const crypto = require("crypto");

const {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  downloadMediaMessage
} = require("@whiskeysockets/baileys");

const { t } = require("../../lib/lang");

function unwrapMessage(message) {
  let current = message;

  while (current) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
      continue;
    }

    if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }

    if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
      continue;
    }

    break;
  }

  return current || {};
}

function getQuotedMessage(msg) {
  const context =
    msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo;

  return context?.quotedMessage
    ? unwrapMessage(context.quotedMessage)
    : null;
}

function getText(message) {
  if (!message) return "";

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ""
  ).trim();
}

function normalizeJid(jid) {
  if (!jid) return "";

  const [user, server] = jid.split("@");
  return `${user.split(":")[0]}@${server || ""}`;
}

module.exports = {
  name: "gstatus",
  aliases: ["groupstatus"],
  description: "Publish a replied message as a group's native status",
  category: "admin",
  usage: ".gstatus <group-jid> (reply to text, image or video)",

  execute: async (sock, msg, args = []) => {
    const sourceJid = msg.key?.remoteJid;
    const targetJid = (args[0] || "").trim();

    if (!targetJid || !/^[^@\s]+@g\.us$/.test(targetJid)) {
      return sock.sendMessage(sourceJid, {
        text: t(sourceJid, "admin.gstatus_usage")
      }, { quoted: msg });
    }

    try {
      // Retrieve the destination group's information.
      const metadata = await sock.groupMetadata(targetJid);

      // Identify the person who issued the command.
      const sender = normalizeJid(
        msg.key?.participant ||
        msg.participant ||
        msg.key?.remoteJid
      );

      // The sender MUST be an admin of the destination group.
      const senderIsAdmin = metadata.participants.some(member =>
        normalizeJid(member.id) === sender &&
        (member.admin === "admin" || member.admin === "superadmin")
      );

      if (!senderIsAdmin) {
        return sock.sendMessage(sourceJid, {
          text: t(sourceJid, "admin.gstatus_admin_only")
        }, { quoted: msg });
      }

      const quoted = getQuotedMessage(msg);

      if (!quoted) {
        return sock.sendMessage(sourceJid, {
          text: t(sourceJid, "admin.gstatus_reply_media")
        }, { quoted: msg });
      }

      let statusMessage;

      if (quoted.imageMessage || quoted.videoMessage) {
        const mediaType = quoted.imageMessage ? "image" : "video";

        console.log(`[gstatus] Preparing ${mediaType} for ${targetJid}`);

        const buffer = await downloadMediaMessage(
          { message: quoted },
          "buffer",
          {},
          {
            logger: sock.logger,
            reuploadRequest: sock.updateMediaMessage
          }
        );

        if (typeof sock.waUploadToServer !== "function") {
          throw new Error("Baileys media upload function is unavailable.");
        }

        const originalMedia = quoted[`${mediaType}Message`];
        const caption = originalMedia.caption || "";

        const prepared = await prepareWAMessageMedia(
          mediaType === "image"
            ? { image: buffer, caption }
            : { video: buffer, caption },
          {
            upload: sock.waUploadToServer,
            logger: sock.logger,
            mediaTypeOverride: mediaType
          }
        );

        const mediaKey = `${mediaType}Message`;

        statusMessage = {
          [mediaKey]: {
            ...prepared[mediaKey],
            contextInfo: {
              isGroupStatus: true
            }
          }
        };
      } else {
        const text = getText(quoted);

        if (!text) {
          return sock.sendMessage(sourceJid, {
            text: t(sourceJid, "admin.gstatus_only_supported")
          }, { quoted: msg });
        }

        statusMessage = {
          extendedTextMessage: {
            text,
            contextInfo: {
              isGroupStatus: true
            }
          }
        };
      }

      // Build the native Group Status wrapper.
      const messageSecret = crypto.randomBytes(32);

      statusMessage.messageContextInfo = { messageSecret };

      const content = {
        messageContextInfo: { messageSecret },
        groupStatusMessageV2: {
          message: statusMessage
        }
      };

      const generated = generateWAMessageFromContent(
        targetJid,
        content,
        { userJid: sock.user?.id }
      );

      await sock.relayMessage(targetJid, generated.message, {
        messageId: generated.key.id
      });

      console.log(`[gstatus] Status relay submitted to ${targetJid}`);

      await sock.sendMessage(sourceJid, {
        text: t(sourceJid, "admin.gstatus_posted")
          .replace("{{group}}", metadata.subject || targetJid)
      }, { quoted: msg });

    } catch (err) {
      console.error("[gstatus] Failed:", err);

      await sock.sendMessage(sourceJid, {
        text: t(sourceJid, "admin.gstatus_failed")
      }, { quoted: msg });
    }
  }
};
