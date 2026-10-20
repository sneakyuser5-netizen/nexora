const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { t } = require("../../lib/lang");

function escapeVCard(value) {
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/\r\n|\r|\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
}

function safeFileName(value) {
    const name = String(value || "Contact")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60);

    return name || "Contact";
}

module.exports = {
    name: "vcard",
    aliases: ["contactcard", "vcf"],
    description: "Create and share a contact card.",
    category: "tools",
    permission: "sudo",
    usage: ".vcard Name | Phone | Email | Organization | Website",

    execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const input = args.join(" ").trim();

        if (!input) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.vcard_usage")
            }, { quoted: msg });
        }

        const fields = input.split("|").map(field => field.trim());

        const name = fields[0] || "";
        const phone = fields[1] || "";
        const email = fields[2] || "";
        const organization = fields[3] || "";
        const website = fields[4] || "";

        if (!name || !phone) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.vcard_invalid")
            }, { quoted: msg });
        }

        const digits = phone.replace(/\D/g, "");

        if (
            digits.length < 5 ||
            digits.length > 20 ||
            !/^[+\d().\s-]+$/.test(phone)
        ) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.vcard_invalid")
            }, { quoted: msg });
        }

        if (
            email &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.vcard_invalid")
            }, { quoted: msg });
        }

        if (
            website &&
            !/^https?:\/\/\S+$/i.test(website)
        ) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.vcard_invalid")
            }, { quoted: msg });
        }

        const lines = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            `FN:${escapeVCard(name)}`,
            `N:${escapeVCard(name)};;;;`,
            `TEL;TYPE=CELL:${escapeVCard(phone)}`
        ];

        if (email) {
            lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(email)}`);
        }

        if (organization) {
            lines.push(`ORG:${escapeVCard(organization)}`);
        }

        if (website) {
            lines.push(`URL:${escapeVCard(website)}`);
        }

        lines.push("END:VCARD");

        const vcardContent = lines.join("\r\n") + "\r\n";
        const fileName = `${safeFileName(name)}.vcf`;
        const tempFile = path.join(
            os.tmpdir(),
            `nexora-${crypto.randomBytes(8).toString("hex")}.vcf`
        );

        try {
            fs.writeFileSync(tempFile, vcardContent, "utf8");

            await sock.sendMessage(
                jid,
                {
                    document: { url: tempFile },
                    mimetype: "text/vcard",
                    fileName,
                    caption: t(jid, "tools.vcard_success")
                },
                { quoted: msg }
            );
        } catch (error) {
            console.error("[VCARD] Failed to create or send contact:", error);

            await sock.sendMessage(jid, {
                text: t(jid, "tools.vcard_error")
            }, { quoted: msg });
        } finally {
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            } catch (error) {
                console.error("[VCARD] Temporary file cleanup failed:", error.message);
            }
        }
    }
};
