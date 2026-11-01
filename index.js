const { t } = require("./lib/lang");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const { loadCommands, loadPluginCommands, handleMessage } = require("./handler");
const { loadEvents, runEvents } = require("./eventHandler");
const settings = require("./lib/settings");


const setup = require("./lib/setup");
const { version: BOT_VERSION } = require("./package.json");

const botName =
    settings.get("global").bot_name ||
    "NEXORA";

const logStore = require("./lib/logger");
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
    const text = args.map(arg => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return arg.message;
        return "";
    }).join(" ");

    // Suppress only serialized WhatsApp message dumps.
    if (
        /"remoteJid"\s*:/.test(text) &&
        /"message"\s*:/.test(text) &&
        /"key"\s*:/.test(text)
    ) {
        return;
    }

    // Keep noisy debug output and pairing codes out of the log.
    if (
        text.startsWith("COMMAND:") ||
        text.startsWith("ARGS:") ||
        text.startsWith("GOODBYE EVENT:") ||
        text.startsWith("LEAVING USER:") ||
        text.startsWith("[STATUS]")
    ) {
        return;
    }

    if (!text.includes("PAIR CODE")) {
        logStore.log(...args);
    }

    originalLog(...args);
};

console.warn = (...args) => {
    logStore.warn(...args);
    originalWarn(...args);
};

console.error = (...args) => {
    logStore.error(...args);
    originalError(...args);
};

async function startBot() {
    try {
    
    const { state, saveCreds } = await useMultiFileAuthState("./session");

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" })
        });
        global.sock = sock;
        global.sockReady = false;

const originalSendMessage = sock.sendMessage.bind(sock);

sock.sendMessage = async (jid, content, options) => {

    try {

        const config = settings.get("global");
        const isSticker = Boolean(content?.sticker);

        if (!isSticker && config.autotyping) {

            await sock.sendPresenceUpdate("composing", jid);
            await new Promise(resolve => setTimeout(resolve, 5000));
            await sock.sendPresenceUpdate("available", jid);

        } else if (!isSticker && config.autorecording) {

            await sock.sendPresenceUpdate("recording", jid);
            await new Promise(resolve => setTimeout(resolve, 5000));
            await sock.sendPresenceUpdate("available", jid);

        }

    } catch (err) {
        console.log("PRESENCE ERROR:", err);
    }

    return originalSendMessage(jid, content, options);
}; // <- THIS } WAS MISSING

sock.ev.on("creds.update", saveCreds);

// ===== STATUS SAVER LISTENER START =====
const identity = require("./lib/identity"); // removed duplicate settings

sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type!== "notify") return;
    const msg = messages[0];
    if (!msg ||!msg.key) return;

    // WhatsApp statuses come from status@broadcast
    if (msg.key.remoteJid === "status@broadcast") {
        const isOn = settings.get("global").status_saver;
        if (!isOn) return;

        const owner = identity.getBotOwner() + "@s.whatsapp.net"; // add @s.whatsapp.net
        const who = msg.key.participant; // who posted the status

        try {
            // Forward the status to you
            await sock.sendMessage(owner, { forward: msg });
            console.log(`[STATUS] Forwarded status from ${who}`);
        } catch (e) {
            console.log("Status forward error:", e);
        }
    }
});
// ===== STATUS SAVER LISTENER END =====

        // load commands ONCE
        loadCommands();
        loadPluginCommands();
        loadEvents();


        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                if (global.sock === sock) global.sockReady = true;

                require("./lib/scheduler").start(sock);
                
                const owner =
    sock.user.id.split(":")[0];

const ownerDB =
    require("./lib/owner");

const data = ownerDB.get();

if (!data || data.botOwner !== owner) {

    ownerDB.set(owner);
    setup.clearPhone();

}
                const info = ownerDB.get();

if (!info.welcomed) {

    try {

        await sock.sendMessage(
            owner + "@s.whatsapp.net",
            {
                image: fs.readFileSync("./assets/menu.png"),

                caption:
`━━━━━━━━━━━━━━━
🤖 *NEXORA*

Welcome *${sock.user.name || "Owner"}*! 🎉

Your WhatsApp has been linked successfully.

👑 You are now the owner of this NEXORA instance.

🚀 Start by typing:

*.menu*

Useful commands:

• .menu
• .setsudo
• .ping

🔑 *API Configuration*

Want to use API-powered commands?

Type *.env* and follow the instructions
to configure your API keys.

Use *.env status* to check your API setup.

Enjoy your new assistant!

━━━━━━━━━━━━━━━

Made with ❤️ by
*𝚃𝚑𝚎 𝚠𝚑𝚒𝚜*`
            }
        );

        ownerDB.welcomed();

        

    } catch (err) {

        

    }

}


    const number =
        sock.user.id.split(":")[0];


    const uptime = () => {

        const seconds =
            Math.floor((Date.now() - START_TIME) / 1000);

        const hours =
            Math.floor(seconds / 3600);

        const minutes =
            Math.floor((seconds % 3600) / 60);

        const secs =
            seconds % 60;

        return `${hours}h ${minutes}m ${secs}s`;

    };


    console.log(`
╔════════════════════════════════╗
║        🤖 BOT ONLINE           ║
╠════════════════════════════════╣
║ BOT NAME:
║ ${botName}
║
║ 📱NUMBER:
║ +${number}
║
║ 📦 VERSION:
║ ${BOT_VERSION}
║
║ ⚡ STATUS:
║ Connected ✅
║
║ ⏱️ UPTIME:
║ ${uptime()}
╚════════════════════════════════╝
    `);

            }

            if (connection === "close") {
                if (global.sock === sock) global.sockReady = false;

                const statusCode = lastDisconnect?.error?.output?.statusCode;

                console.log("❌ Connection closed. Code:", statusCode);

                if (statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(() => startBot(), 3000);
                }
            }
        });
        sock.ev.on("messages.upsert", async ({ messages }) => {

    const msg = messages[0];
    if (!msg.message) return; // add this first
    // Allow bot-owner commands to reach handler.js.
        // handler.js ignores outgoing messages that are not commands.
        const commandText =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

    // Let handler.js decide whether outgoing/self messages
    // should be accepted. This is required for interactive
    // sessions such as Facebook/TikTok quality selection.
    // Do NOT discard "2", "yes", etc. here.


    // ===== GLOBAL AUTO READ START =====
    try {
        const fs = require("fs");
        const readPath = "./database/read.json";

        if (fs.existsSync(readPath)) {
            const readDB = JSON.parse(fs.readFileSync(readPath));
            if (readDB.global) {
                await sock.readMessages([msg.key]); // marks blue ticks
            }
        }
    } catch (err) {
        console.log("AUTO READ ERROR:", err);
    }
    // ===== GLOBAL AUTO READ END =====

    const messageCache = require("./lib/messageCache");
    // Save every incoming message
    if (msg.message &&!msg.key.fromMe) {
        messageCache.save(msg);
    }
        //sock.ev.on("messages.upsert", async ({ messages }) => {

    //const msg = messages[0];
           // const messageCache = require("./lib/messageCache");

// Save every incoming message
//if (msg.message && !msg.key.fromMe) {
    //messageCache.save(msg);
            // AUTO RECORDING ON RECEIVE
try {
    const config = settings.get("global");
    if (config.autorecording &&!msg.key.fromMe) {
        await sock.sendPresenceUpdate("recording", msg.key.remoteJid);
    }
} catch (err) {
    console.log("AUTO RECORD ERROR:", err);
}
//}
            const identity = require("./lib/identity");
            const afk = require("./lib/afk");
            const botId = sock.user.id.split(":")[0];

const senderId = identity.getSender(msg);

if (senderId === botId && !msg.key?.fromMe) {
    return;
}
  
    if (!msg.message) return;
            


const sender = identity.getSender(msg);

const activity = require("./lib/activity");

// Only record activity from real users in groups
if (
    !msg.key.fromMe &&
    msg.key.remoteJid.endsWith("@g.us")
) {
    activity.update(
        msg.key.remoteJid,
        sender
    );
}


    const read = require("./lib/read");

    const user =
        msg.key.participant ||
        msg.key.remoteJid;


    if (read.get(user)) {

        await sock.readMessages([
            msg.key
        ]);

    }
            const context =
    msg.message?.extendedTextMessage?.contextInfo;

const mentions =
    context?.mentionedJid || [];

if (mentions.length) {

    for (const user of mentions) {

    if (!afk.has(user)) continue;

    const data = afk.get(user);

    const duration = afk.format(
        Date.now() - data.time
    );
    

    await sock.sendMessage(
        msg.key.remoteJid,
        {
            text:
`${t(msg.key.remoteJid, "owner.afk_user")}
${t(msg.key.remoteJid, "owner.afk_return_reason")}
${data.reason}

${t(msg.key.remoteJid, "owner.afk_user_away")}
${duration}

${t(msg.key.remoteJid, "owner.afk_user_footer")}`
            
        }
    );
    break;
    }
}      
await runEvents(
        "messages.upsert",
        sock,
        msg
    );
await handleMessage(
        sock,
        msg
    );

}); 
    
     sock.ev.on("group-participants.update", async (update) => {

    await runEvents(
        "group-participants.update",
        sock,
        update
    );

});
sock.ev.on("messages.update", async (updates) => {
    await runEvents(
        "messages.update",
        sock,
        updates
    );
});
        sock.ev.on("presence.update", ({ id, presences }) => {

    const presence = require("./lib/presence");

    for (const user in presences) {

        const state = presences[user]?.lastKnownPresence;

        if (
            state === "available" ||
            state === "composing" ||
            state === "recording" ||
            state === "paused"
        ) {
            presence.set(user);
        }

    }

});

      sock.ev.on("call", async calls => {

    const config = settings.get("global");

    if (!config.anticall) return;

    for (const call of calls) {

        try {

            await sock.rejectCall(call.id, call.from);

        

        } catch (err) {
            console.log("ANTICALL ERROR:", err);
        }

    }

});
        setTimeout(async () => {
            try {

                if (!sock.authState.creds.registered) {                    
const phone = setup.getPhone()?.trim();

if (!phone) {
    console.log(`
╔══════════════════════════════════════╗
║ 🤖 NEXORA SETUP                 ║
╚══════════════════════════════════════╝

❌ NO PHONE NUMBER FOUND

Please add your WhatsApp number to:

database/setup.json

Example:
{
  "phone": "447XXXXXXXXX or 2376XXXXXXXX"
}

Then save the file and restart the bot.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
    return;
}

// Reject placeholder number
if (phone === "237612345678") {
    console.log(`
❌ INVALID PHONE NUMBER

The default/example number is still being used.

Please replace it in:
database/setup.json

Use your real WhatsApp number in international format.

Example:
{
  "phone": "447XXXXXXXXX or 2376XXXXXXXX"
}

Then restart the bot.
`);
    return;
}

// Validate Cameroon WhatsApp number
// Validate international WhatsApp number (allow any country)
if (!/^\d{7,15}$/.test(phone)) {
    console.log(`
❌ INVALID PHONE NUMBER

The number found in database/setup.json is not valid.

Current format:
${phone}

Required format:
447XXXXXXXXX or 2376XXXXXXXX

Example:
447XXXXXXXXX or 2376XXXXXXXX

Do not use:
+237 or +447 
spaces
dashes
or parentheses.

Please correct the number and restart the bot.
`);
    return;
}

console.log(`📱 Phone number found: +${phone}`);
console.log("⏳ Requesting WhatsApp pairing code...");

const code = await sock.requestPairingCode(phone);

console.log("\n======================");
console.log("PAIR CODE 👉", code);
console.log("======================\n");

  
                }

            } catch (err) {
                console.log("Pairing error:", err);
            }
        }, 4000);

    } catch (err) {
        console.log("FATAL ERROR:", err);
        setTimeout(startBot, 5000);
    }
}
const START_TIME = Date.now();

global.START_TIME = START_TIME;



async function boot() {
    try {
        if (process.env.TERMUX_VERSION ||
            process.env.ANDROID_ROOT ||
            (process.env.PREFIX || "").includes("com.termux")) {
            console.log("📱 Termux detected: skipping Linux Lottie converter setup.");
        } else {
            await require("./scripts/install-python-deps")();
            await require("./scripts/install-lottie-converter")();
        }

        startBot();
    } catch (error) {
        console.error("❌ Startup dependency setup failed:", error.message);
        process.exit(1);
    }
}

boot();
