const fs = require("fs");
const clear = require("./lib/clear");
const { t } = require("./lib/lang");
const config = require("./config");
const settings = require("./lib/settings");
const sudo = require("./lib/sudo");
const ownerDB = require("./lib/owner");
const { loadPlugins } = require("./core/pluginManager");
const commands = new Map();
const cooldowns = new Map();
const session = require("./lib/session");

async function isAdmin(sock, msg) {
    const jid = msg.key.remoteJid;
    if (!jid.endsWith("@g.us")) {
        return false;
    }
    const metadata = await sock.groupMetadata(jid);
    const sender = msg.key.participant;
    const participant = metadata.participants.find(p => p.id === sender);
    return (participant?.admin === "admin" || participant?.admin === "superadmin");
}

function loadCommands(dir = "./commands") {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const path = `${dir}/${file}`;
        if (fs.statSync(path).isDirectory()) {
            loadCommands(path);
            continue;
        }
        if (!file.endsWith(".js")) continue;
        const command = require(path);
        commands.set(command.name, command);
        if (command.aliases) {
            for (const alias of command.aliases) {
                commands.set(alias, command);
            }
        }
        console.log("✅ Command loaded:", command.name);
    }
}

function loadPluginCommands() {
    const plugins = loadPlugins();

    for (const [name, plugin] of plugins) {
        if (!plugin || typeof plugin.execute !== "function") {
            console.warn("⚠️ Invalid plugin skipped:", name);
            continue;
        }

        commands.set(name.toLowerCase(), plugin);
        console.log("🔌 Plugin loaded:", name);
    }
}

async function handleMessage(sock, msg) {
    const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text;
    const jid = msg.key.remoteJid;
    // ==========================================
    // BOT ACCOUNT TAG DETECTION
    // ==========================================

    const ownerTagAudio = settings.get("global").ownerTagAudio;

    if (ownerTagAudio) {
        const contextInfo =
            msg.message?.extendedTextMessage?.contextInfo ||
            msg.message?.imageMessage?.contextInfo ||
            msg.message?.videoMessage?.contextInfo ||
            msg.message?.documentMessage?.contextInfo;
        const mentionedJid = contextInfo?.mentionedJid || [];

        if (mentionedJid.length && sock.user?.id) {
            const botNumber = sock.user.id.split("@")[0].split(":")[0];
            let botWasMentioned = false;
            for (const mentioned of mentionedJid) {
                const mentionedNumber = mentioned.split("@")[0].split(":")[0];

                if (mentionedNumber === botNumber) {
                    botWasMentioned = true;
                    break;
                }

                if (mentioned.endsWith("@lid")) {
                    try {
                        const pn = await sock.signalRepository.lidMapping.getPNForLID(mentioned);
                        if (!pn) continue;
                        const resolvedNumber = pn.split("@")[0].split(":")[0];

                        console.log("🔄 MENTION LID:", mentioned, "→", pn);
                        console.log("🔍 COMPARE:", resolvedNumber, "===", botNumber, "?", resolvedNumber === botNumber);

                        if (String(resolvedNumber) === String(botNumber)) {
                            botWasMentioned = true;
                            break;
                        }
                    } catch (err) {
                        console.log("❌ LID RESOLUTION ERROR:", err.message);
                    }
                }
            }


            if (botWasMentioned) {
                console.log("🔔 BOT ACCOUNT MENTIONED:", mentionedJid);

                try {
                    await sock.sendMessage(jid, {
                        audio: {
                            url: "./media/owner-tag.mp3"
                        },
                        mimetype: "audio/mpeg",
                        ptt: true
                    });

                    console.log("🔊 Owner-tag audio sent successfully.");
                } catch (err) {
                    console.error("❌ Failed to send owner-tag audio:", err);
                }
            }
        }
    }



    const isTypingOn = settings.get("global").autotyping;
    if (isTypingOn && text) {
        const jid = msg.key.remoteJid;
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!text) return;
    const sender = msg.key.remoteJid;

    global.messageCache = global.messageCache || {};
    global.messageCache[jid] = global.messageCache[jid] || [];
    global.messageCache[jid].push(msg);

    if (global.messageCache[jid].length > 100) {
        global.messageCache[jid].shift();
    }

    const groupSettings = settings.get(jid);
    let prefix = groupSettings.prefix || ".";
// ==========================================
// OWNER SELF-MESSAGE HANDLING
// Allow the bot owner to send commands from
// the same WhatsApp account the bot uses.
// Ignore other outgoing bot messages.
// ==========================================
if (
    msg.key?.fromMe &&
    !text?.trim().startsWith(prefix)
) {
    const activeSession =
        session.get(jid) ||
        session.get(msg.key?.remoteJidAlt);

    // Allow valid replies to active interactive sessions.
    // Ignore unrelated outgoing messages from the bot itself.
    const answer = text.trim().toLowerCase();

    const validReplies = {
        media_quality: ["1", "2"],
        clear: ["0", "1", "2", "3", "4", "5"],
        kickall: ["yes", "no"]
    };

    const allowedReplies =
        validReplies[activeSession?.type] || [];

    if (
        !allowedReplies.includes(answer) &&
        activeSession?.type !== "schedule"
    ) {
        return;
    }
}

    const identity = require("./lib/identity");
    const senderId = identity.getSender(msg);
    const isOwner = identity.isOwner(msg);
    const isSudo = identity.isSudo(msg);

    const mute = require("./lib/mute");

    if (jid.endsWith("@g.us") && mute.isMuted(jid, senderId) &&!identity.isCreator(msg) &&!identity.isBotOwner(msg) &&!isSudo) {
        return;
    }

    let body = text.trim();

    if (body.startsWith(prefix + " ")) {
        body = prefix + body.slice(prefix.length + 1);
    }

    // ==========================================
    // AFK RETURN HANDLER
    // ==========================================

    const afk = require("./lib/afk");

    // A command beginning with .afk must NEVER
    // trigger the welcome-back handler.
    const commandText = body.slice(prefix.length).trim();
    const commandName = commandText.split(/\s+/)[0].toLowerCase();

    const isAfkCommand =
        body.startsWith(prefix) &&
        commandName === "afk";

    if (!body.startsWith(prefix) && afk.has(senderId)) {

        const data = afk.get(senderId);

        if (data) {
            const duration = afk.format(
                Date.now() - data.time
            );

            afk.remove(senderId);

            await sock.sendMessage(jid, {
                text:
`${t(jid, "owner.afk_return")}

${t(jid, "owner.afk_away")}
${duration}

${t(jid, "owner.afk_return_reason")}
${data.reason}

${t(jid, "owner.afk_return_footer")}`
            });
        }
    }

    // Handle interactive sessions
    if (!body.startsWith(prefix)) {
        const current =
            session.get(jid) ||
            session.get(msg.key?.remoteJidAlt);

        // ==========================================
        // SCHEDULE INTERACTIVE SESSION
        // ==========================================
        if (current?.type === "schedule") {
            if (Date.now() > current.expires) {
                session.delete(jid);

                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_expired")
                });
            }

            const answer = body.trim();

            if (current.step === "jid") {
                if (!answer.endsWith("@g.us")) {
                    return sock.sendMessage(jid, {
                        text: t(jid, "schedule_invalid_jid")
                    });
                }

                current.data.groupJid = answer;
                current.step = "message";
                session.set(jid, current);

                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_step_message")
                });
            }

            if (current.step === "message") {
                if (!answer) {
                    return sock.sendMessage(jid, {
                        text: t(jid, "schedule_invalid_message")
                    });
                }

                current.data.message = answer;
                current.step = "datetime";
                session.set(jid, current);

                return sock.sendMessage(jid, {
                    text: t(jid, "schedule_step_datetime")
                });
            }

            if (current.step === "datetime") {
                const scheduler = require("./lib/scheduler");
                const runAt = scheduler.parseDateTime(answer);

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
                    groupJid: current.data.groupJid,
                    message: current.data.message,
                    runAt
                });

                session.delete(jid);

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

            session.delete(jid);
            return;
        }

        // ==========================================
        // MEDIA QUALITY SELECTION
        // ==========================================

        if (current?.type === "media_quality") {
            const answer = body.trim();

            if (Date.now() > current.expires) {
                session.delete(jid);

                const expiredKey =
                    current.command === "facebook"
                        ? "facebook_quality_expired"
                        : "tiktok_quality_expired";

                return sock.sendMessage(jid, {
                    text: t(jid, expiredKey)
                });
            }

            let quality;

            if (answer === "1") {
                quality =
                    current.command === "tiktok"
                        ? "no_watermark"
                        : "hd";
            } else if (answer === "2") {
                quality = "normal";
            } else {
                const invalidKey =
                    current.command === "facebook"
                        ? "facebook_quality_invalid"
                        : "tiktok_quality_invalid";

                return sock.sendMessage(jid, {
                    text: t(jid, invalidKey)
                });
            }

            const command = commands.get(current.command);

            if (!command) {
                session.delete(jid);

                return sock.sendMessage(jid, {
                    text: t(
                        jid,
                        current.command === "facebook"
                            ? "facebook_failed"
                            : "tiktok_failed"
                    )
                });
            }

            session.delete(jid);

            return command.execute(
                sock,
                msg,
                [current.url, quality]
            );
        }

        if (current?.type === "kickall") {
            const answer = body.trim().toLowerCase();

            if (Date.now() > current.expires) {
                session.delete(jid);
                return sock.sendMessage(jid, {
                    text: t(jid, "admin.kickall_expired")
                });
            }

            if (answer === "no") {
                session.delete(jid);
                return sock.sendMessage(jid, {
                    text: t(jid, "admin.kickall_cancelled")
                });
            }

            if (answer!== "yes") {
                return;
            }

            session.delete(jid);
            let kicked = 0;
            let failed = 0;
            for (const member of current.members) {
                try {
                    await sock.groupParticipantsUpdate(jid, [member.id], "remove");
                    kicked++;
                } catch (err) {
                    console.dir(err, { depth: null });
                    failed++;
                }
            }
            return sock.sendMessage(jid, {
                text: t(jid, "admin.kickall_done")
                   .replace("{{count}}", kicked)
                   .replace("{{failed}}", failed)
            });
        }

        if (current?.type === "clear") {
            switch (body) {
                case "0":
                    session.delete(jid);
                    return sock.sendMessage(jid, {
                        text: t(jid, "owner.clear_cancelled")
                    });
                case "1": {
                    session.delete(jid);
                    const count = await clear.clearCurrent100(sock, jid);
                    return sock.sendMessage(jid, {
                        text: t(jid, "owner.clear_done").replace("{{count}}", count)
                    });
                }
                case "2": {
                    session.delete(jid);
                    const count = await clear.clearCurrentAll(sock, jid);
                    return sock.sendMessage(jid, {
                        text: t(jid, "owner.clear_done").replace("{{count}}", count)
                    });
                }
                case "3": {
                    session.delete(jid);
                    const count = await clear.clearPrivateChats(sock);
                    return sock.sendMessage(jid, {
                        text: t(jid, "owner.clear_done").replace("{{count}}", count)
                    });
                }
                case "4": {
                    session.delete(jid);
                    const count = await clear.clearGroupChats(sock);
                    return sock.sendMessage(jid, {
                        text: t(jid, "owner.clear_done").replace("{{count}}", count)
                    });
                }
                case "5": {
                    session.delete(jid);
                    const count = await clear.clearEverything(sock);
                    return sock.sendMessage(jid, {
                        text: t(jid, "owner.clear_done").replace("{{count}}", count)
                    });
                }
            }
            return;
        }
    }

    // Parse commands (.cmd arg) and (.cmd=arg)
    const content = body.slice(prefix.length).trim();
    const [commandPart,...rest] = content.split(/\s+/);
    const [cmdName, inlineArg] = commandPart.split("=");
    const cmd = cmdName.toLowerCase();
    const args = inlineArg? [inlineArg,...rest] : rest;
    const command = commands.get(cmd);
    if (!command) return;

    if (command.cooldown) {
        const now = Date.now();
        const user = sender;
        const key = `${command.name}:${user}`;
        const lastUsed = cooldowns.get(key);
        const cooldownTime = command.cooldown * 1000;
        if (lastUsed && now - lastUsed < cooldownTime) {
            const remaining = Math.ceil((cooldownTime - (now - lastUsed)) / 1000);
            await sock.sendMessage(sender, { text: `⏳ Please wait ${remaining}s before using this command again.` });
            return;
        }
        cooldowns.set(key, now);
    }

    const permission = command.permission || "public";

    // ==========================================
    // COMMAND ACCESS CONTROL
    // .menu = public
    // Everything else = owner/sudo only
    // ==========================================

// ==========================================
// COMMAND ACCESS CONTROL
// .menu = public
// Everything else = owner/sudo only
// Unauthorized users are silently ignored.
// ==========================================
/*console.log(
    "PERMISSION-TRACE:",
    JSON.stringify({
        fromMe: msg.key?.fromMe,
        remoteJid: msg.key?.remoteJid,
        participant: msg.key?.participant,
        senderId,
        botOwner: identity.getBotOwner(),
        creator: identity.getCreator(),
        isOwner,
        isSudo,
        cmd
    })
);*/

if (cmd !== "menu" && !isOwner && !isSudo) {
    return;
}
    if (permission === "creator" &&!identity.isCreator(msg)) {
        return sock.sendMessage(sender, { text: t("creator_only") });
    }
    if (permission === "owner" &&!isOwner) {
        return sock.sendMessage(sender, { text: t("owner_only") });
    }
    if (permission === "sudo" &&!isOwner &&!isSudo) {
        return sock.sendMessage(sender, { text: t("sudo_only") });
    }
    if (permission === "admin") {
        if (!jid.endsWith("@g.us")) {
            return sock.sendMessage(jid, { text: t("group_only") });
        }
        const admin = await isAdmin(sock, msg);
        if (!admin) {
            return sock.sendMessage(jid, { text: t("admin_only") });
        }
    }

    if (command.usage && command.minArgs) {
        if (args.length < command.minArgs) {
            await sock.sendMessage(sender, { text: `${t("missing_argument")}\n\n${t("usage")}\n${command.usage}` });
            return;
        }
    }

    await command.execute(sock, msg, args);
}

function getCommands() {
    return [...new Set(commands.values())];
}

module.exports = {
    loadCommands,
    loadPluginCommands,
    handleMessage,
    commands,
};
