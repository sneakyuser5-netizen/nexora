const fs = require("fs");
const os = require("os");
const https = require("https");
const { execFileSync } = require("child_process");

const ROOT = process.cwd();
const VENV = `${ROOT}/.venv`;
const PYTHON = `${VENV}/bin/python`;
const VIRTUALENV = `${os.tmpdir()}/virtualenv.pyz`;

function run(command, args) {
    console.log(`> ${command} ${args.join(" ")}`);
    execFileSync(command, args, {
        stdio: "inherit",
        cwd: ROOT
    });
}

function download(url, output) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(output);

        const request = https.get(url, response => {
            if (
                response.statusCode >= 300 &&
                response.statusCode < 400 &&
                response.headers.location
            ) {
                file.close();
                fs.rmSync(output, { force: true });
                return download(response.headers.location, output)
                    .then(resolve)
                    .catch(reject);
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.rmSync(output, { force: true });
                return reject(
                    new Error(`Download failed with HTTP ${response.statusCode}`)
                );
            }

            response.pipe(file);

            file.on("finish", () => {
                file.close(resolve);
            });
        });

        request.on("error", err => {
            file.close();
            fs.rmSync(output, { force: true });
            reject(err);
        });
    });
}

async function main() {
    console.log("==========================================");
    console.log(" Python dependency installer");
    console.log("==========================================");

    if (!fs.existsSync(PYTHON)) {
        console.log("Python virtual environment not found.");
        console.log("Downloading official PyPA virtualenv...");

        await download(
            "https://bootstrap.pypa.io/virtualenv.pyz",
            VIRTUALENV
        );

        console.log("Creating local Python virtual environment...");
        run("python3", [VIRTUALENV, VENV]);

        fs.rmSync(VIRTUALENV, { force: true });
    } else {
        console.log("Python virtual environment already exists.");
    }

    if (!fs.existsSync(PYTHON)) {
        throw new Error("Failed to create .venv/bin/python");
    }

    console.log("Installing Python dependencies inside .venv...");
    run(PYTHON, ["-m", "pip", "install", "-r", "requirements.txt"]);

    console.log("Python dependencies installed successfully.");
}

if (require.main === module) {
    main().catch(error => {
        console.error("Python dependency installation failed:");
        console.error(error);
        process.exit(1);
    });
} else {
    module.exports = main;
}
