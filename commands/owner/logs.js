const { t } = require("../../lib/lang");
const { getRecentLines } = require("../../lib/logger");

module.exports = {
name: "logs",
aliases: ["log"],
description: "View recent bot logs",
category: "owner",
permission: "owner",
usage: ".logs [errors] [number]",

execute: async (sock, msg, args = []) => {
    const jid = msg.key.remoteJid;
    const input = args.map(arg => String(arg).toLowerCase());

    const errorsOnly = input.includes("errors");
    const numberArg = input.find(arg => /^\d+$/.test(arg));

    if (input.some(arg => arg !== "errors" && !/^\d+$/.test(arg))) {
        await sock.sendMessage(
            jid,
            { text: t(jid, "owner.logs_usage") },
            { quoted: msg }
        );
        return;
    }

    const count = numberArg === undefined ? 20 : Number(numberArg);

    if (count < 1 || count > 100) {
        await sock.sendMessage(
            jid,
            { text: t(jid, "owner.logs_usage") },
            { quoted: msg }
        );
        return;
    }

    let lines;

    try {
        lines = getRecentLines(count, errorsOnly ? "errors" : "all");
    } catch (error) {
        await sock.sendMessage(
            jid,
            { text: t(jid, "owner.logs_unavailable") },
            { quoted: msg }
        );
        return;
    }

    if (!lines.length) {
        await sock.sendMessage(
            jid,
            { text: t(jid, "owner.logs_empty") },
            { quoted: msg }
        );
        return;
    }

    const title = t(jid, "owner.logs_title");
    const outputLimit = 6000;
    let output = "";

    for (const line of lines) {
        const candidate = output ? `${output}\n${line}` : line;

        if (`${title}\n\n${candidate}`.length > outputLimit) {
            break;
        }

        output = candidate;
    }

    if (!output) {
        output = lines[lines.length - 1].slice(0, 1000);
    }

    const message = `${title}\n\n${output}`;

    await sock.sendMessage(
        jid,
        { text: message },
        { quoted: msg }
    );
}

};
