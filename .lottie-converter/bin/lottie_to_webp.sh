#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [[ -n "${TERMUX_VERSION:-}" ||
      -n "${ANDROID_ROOT:-}" ||
      "${PREFIX:-}" == *com.termux* ]]; then
    RENDERER="$ROOT_DIR/scripts/native/lottie_to_png"
else
    RENDERER="$SCRIPT_DIR/lottie_to_png"
fi

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

FFMPEG="${FFMPEG:-ffmpeg}"

if ! command -v "$FFMPEG" >/dev/null 2>&1; then
    echo "FFmpeg is not installed or unavailable in PATH." >&2
    exit 1
fi

WEBP_ENCODERS="$("$FFMPEG" -hide_banner -encoders 2>/dev/null)"

if grep -q 'libwebp_anim' <<< "$WEBP_ENCODERS"; then
    WEBP_ENCODER="libwebp_anim"
elif grep -q 'libwebp' <<< "$WEBP_ENCODERS"; then
    WEBP_ENCODER="libwebp"
else
    echo "FFmpeg has no supported WebP encoder." >&2
    exit 1
fi

echo "Using FFmpeg encoder: $WEBP_ENCODER"

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

FPS="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["fr"])' "$JSON")"

if ! awk -v fps="$FPS" 'BEGIN { exit !(fps > 0) }'; then
    echo "Invalid animation frame rate: $FPS" >&2
    exit 1
fi

RENDER_LOG="$TMP_DIR/render.log"
"$RENDERER" "$JSON" --output "$FRAMES" --width 384 --height 136 --fps "$FPS" 2>&1 | tee "$RENDER_LOG"

mapfile -t PNG_FILES < <(
    find "$FRAMES" -maxdepth 1 -type f -name 'frame_*.png' | sort
)

if ((${#PNG_FILES[@]} == 0)); then
    echo "Renderer produced no PNG frames." >&2
    exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

INPUT_RATE="$FPS"

"$FFMPEG" -hide_banner -loglevel error -y \
    -framerate "$INPUT_RATE" \
    -i "$FRAMES/frame_%05d.png" \
    -an \
    -c:v "$WEBP_ENCODER" \
    -lossless 0 \
    -quality 80 \
    -compression_level 0 \
    -loop 0 \
    -vsync 0 \
    "$OUTPUT"

if [[ ! -s "$OUTPUT" ]]; then
    echo "WebP conversion produced an empty output file." >&2
    exit 1
fi

echo "Converted ${#PNG_FILES[@]} frames to $OUTPUT"
