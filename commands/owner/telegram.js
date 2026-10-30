const fs = require("fs");
const { spawn } = require("child_process");
const path = require("path");
const { t } = require("../../lib/lang");

function runAuth(action, value = "") {
    return new Promise((resolve) => {
        const rootDir = path.resolve(__dirname, "../..");
        const script = path.join(rootDir, "lib", "telegram_auth.py");
        const venvPython = path.join(rootDir, ".venv", "bin", "python");
        const python = fs.existsSync(venvPython)
            ? venvPython
            : (process.env.PYTHON || "python3");

        const child = spawn(python, [script], {
            cwd: rootDir,
            stdio: ["pipe", "pipe", "ignore"],
            env: { ...process.env, PYTHONUNBUFFERED: "1" }
        });

        let stdout = "";
        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
            if (stdout.length > 12000) {
                stdout = stdout.slice(-12000);
            }
        });

        child.on("error", () => {
            finish({ ok: false, key: "telegram_python_missing" });
        });

        child.on("close", () => {
            try {
                const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
                const result = JSON.parse(lines[lines.length - 1] || "{}");

                if (!result.key) {
                    finish({ ok: false, key: "telegram_helper_invalid" });
                    return;
                }

                finish(result);
            } catch {
                finish({ ok: false, key: "telegram_helper_invalid" });
            }
        });

        // Keep phone numbers, login codes and passwords out of process arguments.
        child.stdin.end(JSON.stringify({ action, value }));
    });
}

module.exports = {
    name: "telegram",
    aliases: ["tglogin"],
    category: "owner",
    permission: "owner",
    usage: ".telegram <login|code|password|status|logout>",
    description: "Connect and manage a Telegram account for sticker downloads",

    execute: async (sock, msg, args = []) => {
        const jid = String(msg?.key?.remoteJid || "");

        if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") {
            if (jid) {
                await sock.sendMessage(jid, {
                    text: t(jid, "telegram_private_warning")
                });
            }
            return;
        }

        const action = String(args[0] || "").toLowerCase();
        const value = args.slice(1).join(" ").trim();

        if (!["login", "code", "password", "status", "logout"].includes(action)) {
            const help = [
                t(jid, "telegram_title"),
                "",
                t(jid, "telegram_help_login"),
                t(jid, "telegram_help_code"),
                t(jid, "telegram_help_password"),
                t(jid, "telegram_help_status"),
                t(jid, "telegram_help_logout"),
                "",
                t(jid, "telegram_sensitive_warning")
            ].join("\n");

            await sock.sendMessage(jid, { text: help });
            return;
        }

        if (action === "login" && !value) {
            await sock.sendMessage(jid, {
                text: t(jid, "telegram_usage_login")
            });
            return;
        }

        if (action === "code" && !value) {
            await sock.sendMessage(jid, {
                text: t(jid, "telegram_usage_code")
            });
            return;
        }

        if (action === "password" && !value) {
            await sock.sendMessage(jid, {
                text: t(jid, "telegram_usage_password")
            });
            return;
        }

        // Best-effort deletion of messages containing one-time codes/passwords.
        if (["code", "password"].includes(action) && msg?.key) {
            try {
                await sock.sendMessage(jid, { delete: msg.key });
            } catch {}
        }

        const progressKeys = {
            login: "telegram_progress_login",
            code: "telegram_progress_code",
            password: "telegram_progress_password",
            status: "telegram_progress_status",
            logout: "telegram_progress_logout"
        };

        await sock.sendMessage(jid, {
            text: t(jid, progressKeys[action])
        });

        const result = await runAuth(action, value);
        let response = t(
            jid,
            result.key || "telegram_helper_error"
        );

        if (result.key === "telegram_flood_wait" &&
            Number.isFinite(Number(result.seconds))) {
            response = response.replace(
                "{seconds}",
                String(result.seconds)
            );
        }

        if (result.ok && result.account) {
            response += `\n${t(jid, "telegram_account_label")}: ${result.account}`;
        }

        await sock.sendMessage(jid, { text: response });
    }
};
