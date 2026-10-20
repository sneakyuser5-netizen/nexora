const { t } = require("../../lib/lang");

const MAX_LENGTH = 200;
const MAX_DEPTH = 30;
const MAX_ABS_RESULT = 1e100;

function calculate(input) {
    let expression = input
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/−/g, "-")
        .replace(/,/g, ".")
        .replace(/\bsquare\s+root\s+of\s+/gi, "sqrt(");

    expression = expression.replace(
        /sqrt\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)/gi,
        "sqrt($1)"
    );

    if (
        !expression ||
        expression.length > MAX_LENGTH ||
        /[^0-9+\-*/^().%\s,a-z]/i.test(expression)
    ) {
        throw new Error("invalid");
    }

    expression = expression.replace(
        /(\d+(?:\.\d*)?|\.\d+)\s*%\s*of\s*(?=\d|\()/gi,
        "($1/100)*"
    );

    expression = expression.replace(
        /(\d+(?:\.\d*)?|\.\d+)\s*%/g,
        "($1/100)"
    );

    const tokens = expression.match(
        /sqrt|of|\d+(?:\.\d*)?|\.\d+|[()+\-*/^]/gi
    );

    if (!tokens || tokens.join("").length !== expression.replace(/\s+/g, "").length) {
        throw new Error("invalid");
    }

    let pos = 0;
    let depth = 0;

    function peek() {
        return tokens[pos];
    }

    function consume(expected) {
        if (peek() !== expected) {
            throw new Error("invalid");
        }
        pos++;
    }

    function checked(value) {
        if (!Number.isFinite(value) || Math.abs(value) > MAX_ABS_RESULT) {
            throw new Error("range");
        }
        return value;
    }

    function primary() {
        if (++depth > MAX_DEPTH) {
            throw new Error("range");
        }

        let value;

        if (peek() === "+") {
            pos++;
            value = primary();
        } else if (peek() === "-") {
            pos++;
            value = -primary();
        } else if (peek() === "(") {
            pos++;
            value = addSub();
            consume(")");
        } else if (/^sqrt$/i.test(peek() || "")) {
            pos++;
            consume("(");
            const number = addSub();
            consume(")");

            if (number < 0) {
                throw new Error("domain");
            }

            value = Math.sqrt(number);
        } else if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(peek() || "")) {
            value = Number(peek());
            pos++;
        } else {
            throw new Error("invalid");
        }

        depth--;
        return checked(value);
    }

    function power() {
        let left = primary();

        if (peek() === "^") {
            pos++;
            left = checked(left ** unary());
        }

        return left;
    }

    function unary() {
        if (peek() === "+") {
            pos++;
            return unary();
        }

        if (peek() === "-") {
            pos++;
            return -unary();
        }

        return power();
    }

    function multiplyDivide() {
        let value = unary();

        while (peek() === "*" || peek() === "/") {
            const operator = tokens[pos++];

            if (operator === "*") {
                value = checked(value * unary());
            } else {
                const divisor = unary();

                if (divisor === 0) {
                    throw new Error("zero");
                }

                value = checked(value / divisor);
            }
        }

        return value;
    }

    function addSub() {
        let value = multiplyDivide();

        while (peek() === "+" || peek() === "-") {
            const operator = tokens[pos++];
            const right = multiplyDivide();

            value = checked(
                operator === "+" ? value + right : value - right
            );
        }

        return value;
    }

    const result = addSub();

    if (pos !== tokens.length) {
        throw new Error("invalid");
    }

    return result;
}

function formatResult(value) {
    if (Object.is(value, -0)) {
        value = 0;
    }

    return Number.isInteger(value)
        ? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
        : Number(value.toPrecision(12)).toLocaleString("en-US", {
            maximumFractionDigits: 12
        });
}

module.exports = {
    name: "calc",
    aliases: ["calculate"],
    description: "Calculate mathematical expressions",
    category: "tools",
    permission: "sudo",
    usage: ".calc <expression>",
    execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const input = args.join(" ").trim();

        if (!input) {
            return sock.sendMessage(jid, {
                text: t(jid, "tools.calc_usage")
            }, { quoted: msg });
        }

        try {
            const result = calculate(input);

            return sock.sendMessage(jid, {
                text:
                    `🧮 *${t(jid, "tools.calc_title")}*\n\n` +
                    `╭─「 𝙀𝙓𝙋𝙍𝙀𝙎𝙎𝙄𝙊𝙉 」\n` +
                    `│ ${input}\n` +
                    `╰──────────────\n\n` +
                    `╭─「 𝙍𝙀𝙎𝙐𝙇𝙏 」\n` +
                    `│ *${formatResult(result)}*\n` +
                    `╰──────────────`
            }, { quoted: msg });
        } catch (err) {
            const key = err.message === "zero"
                ? "tools.calc_zero"
                : err.message === "domain"
                    ? "tools.calc_domain"
                    : err.message === "range"
                        ? "tools.calc_range"
                        : "tools.calc_invalid";

            return sock.sendMessage(jid, {
                text: t(jid, key)
            }, { quoted: msg });
        }
    },

    calculate
};
