const { t } = require("../../lib/lang");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

module.exports = {
    name: "sticker",
    description: "Download stickers from a Telegram sticker pack",
    category: "media",
    permission: "sudo",
    usage: ".sticker <Telegram sticker pack link>",
    minArgs: 1,

    execute: async (sock, msg, args = []) => {
        const jid = msg.key.remoteJid;
        const link = args.join(" ").trim();

        // ==========================================
        // CHECK LINK
        // ==========================================

        if (!link) {
            return sock.sendMessage(jid, {
                text: t(jid, "sticker_missing")
            });
        }

        const match = link.match(
            /^https?:\/\/t\.me\/addstickers\/([A-Za-z0-9_-]+)\/?$/
        );

        if (!match) {
            return sock.sendMessage(jid, {
                text: t(jid, "sticker_invalid")
            });
        }

        const rootDir = path.resolve(
            __dirname,
            "../.."
        );

        const mediaDir = path.join(
            rootDir,
            "media"
        );

        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, {
                recursive: true
            });
        }

        const baseName = `telegram-sticker-${Date.now()}`;
        const packDir = path.join(
            mediaDir,
            baseName
        );

        fs.mkdirSync(packDir, {
            recursive: true
        });

        try {
            // ==========================================
            // START MESSAGE
            // ==========================================

            await sock.sendMessage(jid, {
                text: t(jid, "sticker_downloading")
            });

            console.log(
                `🎨 TELEGRAM STICKER: starting download for ${link}`
            );

            console.log(
                `🎨 TELEGRAM STICKER: output directory = ${packDir}`
            );

            // ==========================================
            // FIND PYTHON
            // ==========================================

            const venvPython = path.join(
                rootDir,
                ".venv",
                "bin",
                "python"
            );

            const pythonCommand = fs.existsSync(venvPython)
                ? venvPython
                : (process.env.PYTHON || "python3");

            console.log(
                `🐍 TELEGRAM STICKER: Python = ${pythonCommand}`
            );

            const pythonScript = path.join(
                rootDir,
                "lib",
                "telegram_stickers.py"
            );

            console.log(
                `🐍 TELEGRAM STICKER: script = ${pythonScript}`
            );

            // ==========================================
            // DOWNLOAD TELEGRAM STICKERS WITH TELETHON
            // LIVE OUTPUT
            // ==========================================

            await new Promise((resolve, reject) => {
                console.log(
                    "🐍 TELEGRAM STICKER: launching Python process..."
                );

                const child = spawn(
                    pythonCommand,
                    [
                        "-u",
                        pythonScript,
                        link,
                        packDir
                    ],
                    {
                        cwd: rootDir,
                        env: {
                            ...process.env,
                            PYTHONUNBUFFERED: "1"
                        }
                    }
                );

                let stderrBuffer = "";
                let stdoutBuffer = "";

                child.stdout.on("data", data => {
                    const text = data.toString();

                    stdoutBuffer += text;

                    console.log(
                        "🐍 TELEGRAM PYTHON:",
                        text.trimEnd()
                    );
                });

                child.stderr.on("data", data => {
                    const text = data.toString();

                    stderrBuffer += text;

                    console.error(
                        "🐍 TELEGRAM PYTHON STDERR:",
                        text.trimEnd()
                    );
                });

                child.on("error", error => {
                    console.error(
                        "🐍 TELEGRAM PYTHON SPAWN ERROR:",
                        error
                    );

                    reject(error);
                });

                child.on("close", code => {
                    console.log(
                        `🐍 TELEGRAM PYTHON: process exited with code ${code}`
                    );

                    if (code !== 0) {
                        const error = new Error(
                            `Telegram sticker downloader exited with code ${code}`
                        );

                        error.stdout = stdoutBuffer;
                        error.stderr = stderrBuffer;

                        reject(error);
                        return;
                    }

                    resolve();
                });
            });

            // ==========================================
            // VERIFY DOWNLOAD DIRECTORY
            // ==========================================

            if (!fs.existsSync(packDir)) {
                throw new Error(
                    "Sticker download directory was not created."
                );
            }

            // ==========================================
            // PROCESS TELEGRAM STICKERS
            // ==========================================

            const converter = path.join(
                rootDir,
                ".lottie-converter",
                "bin",
                "lottie_to_webp.sh"
            );

            const files = fs
                .readdirSync(packDir)
                .filter(file =>
                    /^sticker_\d+\.(tgs|webp|webm|unknown)$/i.test(file)
                )
                .sort((a, b) => {
                    const numberA = parseInt(
                        a.match(/\d+/)[0],
                        10
                    );

                    const numberB = parseInt(
                        b.match(/\d+/)[0],
                        10
                    );

                    return numberA - numberB;
                });

            console.log(
                `🎨 Telegram stickers downloaded: ${files.length}`
            );

            if (!files.length) {
                throw new Error(
                    "No Telegram stickers were downloaded."
                );
            }

            // ==========================================
            // PROCESS EACH STICKER
            // ==========================================

            for (const file of files) {
                const inputFile = path.join(
                    packDir,
                    file
                );

                // ==========================================
                // WEBP
                // ==========================================

                if (/\.webp$/i.test(file)) {
                    console.log(
                        `🎨 Telegram WebP ready: ${file}`
                    );

                    continue;
                }

                // ==========================================
                // WEBM
                // ==========================================

                if (/\.webm$/i.test(file)) {
                    const outputFile = path.join(
                        packDir,
                        file.replace(
                            /\.webm$/i,
                            ".webp"
                        )
                    );

                    console.log(
                        `🎬 Converting ${file} → ${path.basename(outputFile)}`
                    );

                    await new Promise((resolve, reject) => {
                        const ffmpeg = spawn(
                            "ffmpeg",
                            [
                                "-y",
                                "-i",
                                inputFile,
                                "-vf",
                                "scale=512:512:force_original_aspect_ratio=decrease,fps=30",
                                "-c:v",
                                "libwebp_anim",
                                "-lossless",
                                "0",
                                "-q:v",
                                "75",
                                outputFile
                            ]
                        );

                        ffmpeg.stdout.on("data", data => {
                            console.log(
                                "FFMPEG:",
                                data.toString().trimEnd()
                            );
                        });

                        ffmpeg.stderr.on("data", data => {
                            console.error(
                                "FFMPEG STDERR:",
                                data.toString().trimEnd()
                            );
                        });

                        ffmpeg.on("error", reject);

                        ffmpeg.on("close", code => {
                            if (code !== 0) {
                                reject(
                                    new Error(
                                        `FFmpeg exited with code ${code} for ${file}`
                                    )
                                );
                                return;
                            }

                            console.log(
                                `🎬 WebM converted successfully: ${file}`
                            );

                            resolve();
                        });
                    });

                    continue;
                }

                // ==========================================
                // UNKNOWN
                // ==========================================

                if (/\.unknown$/i.test(file)) {
                    console.warn(
                        `⚠️ Skipping unknown Telegram sticker format: ${file}`
                    );

                    continue;
                }

                // ==========================================
                // TGS
                // ==========================================

                if (/\.tgs$/i.test(file)) {
                    if (!fs.existsSync(converter)) {
                        throw new Error(
                            "Lottie converter is not installed."
                        );
                    }

                    const outputFile = path.join(
                        packDir,
                        file.replace(
                            /\.tgs$/i,
                            ".webp"
                        )
                    );

                    console.log(
                        `🎨 Converting ${file} → ${path.basename(outputFile)}`
                    );

                    await new Promise((resolve, reject) => {
                        console.log(
                            `🎨 LOTTIE: starting converter for ${file}`
                        );

                        const lottie = spawn(
                            converter,
                            [
                                "--output",
                                outputFile,
                                inputFile
                            ],
                            {
                                cwd: rootDir
                            }
                        );

                        lottie.stdout.on("data", data => {
                            console.log(
                                "LOTTIE:",
                                data.toString().trimEnd()
                            );
                        });

                        lottie.stderr.on("data", data => {
                            console.error(
                                "LOTTIE STDERR:",
                                data.toString().trimEnd()
                            );
                        });

                        lottie.on("error", error => {
                            console.error(
                                `LOTTIE SPAWN ERROR ${file}:`,
                                error
                            );

                            reject(error);
                        });

                        lottie.on("close", code => {
                            if (code !== 0) {
                                reject(
                                    new Error(
                                        `Lottie converter exited with code ${code} for ${file}`
                                    )
                                );
                                return;
                            }

                            console.log(
                                `🎨 Lottie converted successfully: ${file}`
                            );

                            resolve();
                        });
                    });
                }
            }

            // ==========================================
            // FIND CONVERTED WEBP FILES
            // ==========================================

            const stickerFiles = fs
                .readdirSync(packDir)
                .filter(file =>
                    /^sticker_\d+\.webp$/i.test(file)
                )
                .sort((a, b) => {
                    const numberA = parseInt(
                        a.match(/\d+/)[0],
                        10
                    );

                    const numberB = parseInt(
                        b.match(/\d+/)[0],
                        10
                    );

                    return numberA - numberB;
                });

            console.log(
                `🎨 Telegram stickers ready for WhatsApp: ${stickerFiles.length}`
            );

            if (!stickerFiles.length) {
                throw new Error(
                    "No converted WEBP stickers were produced."
                );
            }

            // ==========================================
            // SEND STICKERS
            // ==========================================

            // Wait for the current WhatsApp socket, including reconnects.
            const waitForActiveSocket = async (timeout = 30000) => {
                const started = Date.now();

                while (Date.now() - started < timeout) {
                    const activeSock = global.sock;

                    if (activeSock && global.sockReady === true) {
                        return activeSock;
                    }

                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                throw new Error(
                    "WhatsApp connection did not become ready in time."
                );
            };

            let sent = 0;

            for (const file of stickerFiles) {
                const stickerFile = path.join(
                    packDir,
                    file
                );

                if (!fs.existsSync(stickerFile)) {
                    continue;
                }

                try {
                    const activeSock = await waitForActiveSocket();

                    await activeSock.sendMessage(jid, {
                        sticker: {
                            url: stickerFile
                        }
                    });

                    sent++;

                    console.log(
                        `🎨 WhatsApp sticker sent: ${file}`
                    );

                    await new Promise(resolve =>
                        setTimeout(resolve, 500)
                    );
                } catch (err) {
                    console.error(
                        `WHATSAPP STICKER ${file} ERROR:`,
                        err.message
                    );

                    // Do not continue sending through a broken connection.
                    throw err;
                }
            }

            // ==========================================
            // CHECK RESULT
            // ==========================================

            if (sent === 0) {
                throw new Error(
                    "No stickers could be sent."
                );
            }

            console.log(
                `🎨 Telegram sticker command completed: ${sent} stickers sent.`
            );

            // ==========================================
            // SUCCESS
            // ==========================================

            const activeSock = await waitForActiveSocket();

            await activeSock.sendMessage(jid, {
                text: t(jid, "sticker_success")
                    .replace(
                        "{{count}}",
                        String(sent)
                    )
            });

        } catch (err) {
            console.error(
                "TELEGRAM STICKER COMMAND ERROR:",
                err
            );

            try {
                const activeSock = global.sock;

                if (activeSock && global.sockReady === true) {
                    await activeSock.sendMessage(jid, {
                        text: t(jid, "sticker_failed")
                    });
                } else {
                    console.log(
                        "STICKER FAILURE NOTICE SKIPPED: WhatsApp is disconnected."
                    );
                }
            } catch (notifyError) {
                console.error(
                    "STICKER FAILURE NOTIFICATION ERROR:",
                    notifyError.message
                );
            }

        } finally {
            // ==========================================
            // CLEANUP
            // ==========================================

            try {
                if (fs.existsSync(packDir)) {
                    fs.rmSync(packDir, {
                        recursive: true,
                        force: true
                    });

                    console.log(
                        "🧹 Telegram sticker files cleaned."
                    );
                }
            } catch (err) {
                console.error(
                    "STICKER CLEANUP ERROR:",
                    err.message
                );
            }
        }
    }
};
