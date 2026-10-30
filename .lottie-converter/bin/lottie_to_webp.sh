#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RENDERER="$ROOT_DIR/scripts/native/lottie_to_png"

OUTPUT=""
INPUT=""

while (($#)); do
    case "$1" in
        --output)
            OUTPUT="${2:?Missing output path}"
            shift 2
            ;;
        *)
            INPUT="$1"
            shift
            ;;
    esac
done

if [[ -z "$OUTPUT" || -z "$INPUT" ]]; then
    echo "Usage: lottie_to_webp.sh --output OUTPUT INPUT.tgs" >&2
    exit 2
fi

if [[ ! -x "$RENDERER" ]]; then
    echo "Native Lottie renderer not found or not executable: $RENDERER" >&2
    exit 1
fi

if [[ ! -f "$INPUT" ]]; then
    echo "Input sticker not found: $INPUT" >&2
    exit 1
fi

if ! command -v img2webp >/dev/null 2>&1; then
    echo "img2webp is not installed." >&2
    exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nexora-sticker.XXXXXX")"
cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

JSON="$INPUT"
if [[ "$INPUT" == *.tgs ]]; then
    JSON="$TMP_DIR/animation.json"
    gzip -dc "$INPUT" > "$JSON"
fi

FRAMES="$TMP_DIR/frames"
mkdir -p "$FRAMES"

"$RENDERER" "$JSON" "$FRAMES" 384 136

mapfile -t PNG_FILES < <(find "$FRAMES" -maxdepth 1 -type f -name 'frame_*.png' | sort)

if ((${#PNG_FILES[@]} == 0)); then
    echo "Renderer produced no PNG frames." >&2
    exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

DELAY=22
img2webp -loop 0 -lossy -d "$DELAY" -q 80 -m 0 "${PNG_FILES[@]}" -o "$OUTPUT"

if [[ ! -s "$OUTPUT" ]]; then
    echo "WebP conversion produced an empty output file." >&2
    exit 1
fi

echo "Converted ${#PNG_FILES[@]} frames to $OUTPUT"
