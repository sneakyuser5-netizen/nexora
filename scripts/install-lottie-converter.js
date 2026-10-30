const fs = require("fs");
const https = require("https");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const extract = require("extract-zip");

const ROOT = path.resolve(__dirname, "..");
const INSTALL_DIR = path.join(ROOT, ".lottie-converter");
const BIN_DIR = path.join(INSTALL_DIR, "bin");
const WEBP_SCRIPT = path.join(BIN_DIR, "lottie_to_webp.sh");
const RENDERER = path.join(BIN_DIR, "lottie_to_png");

const VERSION = "v1.2.0";

function detectAsset() {
    if (
        process.env.TERMUX_VERSION ||
        process.env.ANDROID_ROOT ||
        (process.env.PREFIX || "").includes("com.termux")
    ) {
        throw new Error("Linux converter installation is not supported in Termux.");
    }

    if (os.platform() !== "linux") {
        throw new Error(`Unsupported platform: ${os.platform()}`);
    }

    const assets = {
        x64: "lottie-converter.linux.amd64.zip",
        arm64: "lottie-converter.linux.arm64.zip"
    };

    const asset = assets[os.arch()];

    if (!asset) {
        throw new Error(`Unsupported architecture: ${os.arch()}`);
    }

    return asset;
}

function download(url, destination, redirects = 5) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, response => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                response.resume();

                if (!response.headers.location || redirects <= 0) {
                    reject(new Error("Invalid or excessive download redirects."));
                    return;
                }

                download(
                    new URL(response.headers.location, url).toString(),
                    destination,
                    redirects - 1
                ).then(resolve, reject);

                return;
            }

            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`Download failed: HTTP ${response.statusCode}`));
                return;
            }

            const output = fs.createWriteStream(destination);

            output.on("error", reject);
            response.on("error", reject);
            output.on("finish", () => output.close(resolve));

            response.pipe(output);
        });

        request.on("error", reject);
    });
}

function verifyInstallation() {
    for (const file of [WEBP_SCRIPT, RENDERER]) {
        if (!fs.existsSync(file)) {
            throw new Error(`Missing official converter file: ${file}`);
        }

        fs.chmodSync(file, 0o755);
    }

    const binary = fs.readFileSync(RENDERER);
    const expectedMachine = os.arch() === "x64" ? 62 :
        os.arch() === "arm64" ? 183 : null;

    if (
        binary.length < 20 ||
        binary.subarray(0, 4).toString("hex") !== "7f454c46" ||
        binary.readUInt16LE(18) !== expectedMachine
    ) {
        throw new Error(`Renderer architecture mismatch. Expected ${os.arch()}.`);
    }

    const firstLine = fs.readFileSync(WEBP_SCRIPT, "utf8").split(/\r?\n/, 1)[0];

    if (firstLine.includes("/data/data/com.termux")) {
        throw new Error("Termux-specific converter script detected.");
    }

    try {
        const encoders = execFileSync("ffmpeg", [
            "-hide_banner", "-encoders"
        ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

        if (!encoders.includes("libwebp_anim")) {
            throw new Error("FFmpeg lacks the libwebp_anim encoder.");
        }
    } catch (error) {
        throw new Error(`FFmpeg animated WebP support unavailable: ${error.message}`);
    }

    console.log("Official Linux Lottie converter verified.");
}

async function main() {
    const asset = detectAsset();

    fs.mkdirSync(BIN_DIR, { recursive: true });

    let valid = false;

    if (fs.existsSync(WEBP_SCRIPT) && fs.existsSync(RENDERER)) {
        try {
            verifyInstallation();
            valid = true;
        } catch (error) {
            console.log(`Existing installation needs repair: ${error.message}`);
        }
    }

    if (valid) return;

    const archive = path.join(INSTALL_DIR, asset);
    const url =
        `https://github.com/ed-asriyan/lottie-converter/releases/download/` +
        `${VERSION}/${asset}`;

    const stagingDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "nexora-lottie-")
    );

    try {
        console.log(`Downloading official Linux converter: ${asset}`);

        await download(url, archive);

        await extract(archive, { dir: stagingDir });

        const downloadedRenderer = path.join(
            stagingDir, "bin", "lottie_to_png"
        );

        if (!fs.existsSync(downloadedRenderer)) {
            throw new Error("Official archive does not contain bin/lottie_to_png.");
        }

        fs.copyFileSync(downloadedRenderer, RENDERER);
        fs.chmodSync(RENDERER, 0o755);

        verifyInstallation();

        console.log("Lottie converter installation completed.");
    } finally {
        if (fs.existsSync(archive)) {
            fs.unlinkSync(archive);
        }

        fs.rmSync(stagingDir, { recursive: true, force: true });
    }
}

module.exports = main;

if (require.main === module) {
    main().catch(error => {
        console.error(`Lottie converter setup failed: ${error.message}`);
        process.exitCode = 1;
    });
}
