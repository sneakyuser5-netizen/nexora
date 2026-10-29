import sys
import os
import re
import asyncio
import fcntl

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.functions.messages import GetStickerSetRequest
from telethon.tl.types import InputStickerSetShortName


# ============================================================
# PROJECT ROOT
# ============================================================

PROJECT_ROOT = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# TELEGRAM CREDENTIALS
# ============================================================

from telegram_config import API_ID, API_HASH


# ============================================================
# TELEGRAM SESSION
# ============================================================

TELEGRAM_AUTH_DIR = os.path.join(
    PROJECT_ROOT,
    ".telegram-auth"
)
SESSION_FILE = os.path.join(
    TELEGRAM_AUTH_DIR,
    "session.string"
)


# ============================================================
# TELEGRAM SESSION PROCESS LOCK
# ============================================================

LOCK_FILE = os.path.join(
    PROJECT_ROOT,
    "telegram_stickers.lock"
)


# ============================================================
# EXTRACT STICKER PACK SHORT NAME
# ============================================================

def extract_short_name(url):
    """
    Extract the sticker-pack short name from:

    https://t.me/addstickers/DEDSECH
    """

    url = url.strip()

    match = re.search(
        r"^(?:https?://)?t\.me/addstickers/([A-Za-z0-9_]+)(?:\?.*)?$",
        url
    )

    if not match:
        raise ValueError(
            "Invalid Telegram sticker pack link."
        )

    return match.group(1)


# ============================================================
# DOWNLOAD TELEGRAM STICKER PACK
# ============================================================

async def download_stickers(
    url,
    output_dir
):
    """
    Download every sticker from a Telegram sticker pack.

    Returns:
        list of downloaded sticker file paths
    """

    short_name = extract_short_name(url)

    os.makedirs(
        output_dir,
        exist_ok=True
    )

    # Use the private session created by the .telegram login command.
    # Never prompt for login from this background downloader.
    if not os.path.isfile(SESSION_FILE):
        raise RuntimeError(
            "No Telegram account is connected. Use .telegram login <phone> "
            "in a private chat with the bot first."
        )

    with open(SESSION_FILE, "r", encoding="utf-8") as session_handle:
        telegram_session = session_handle.read().strip()

    if not telegram_session:
        raise RuntimeError(
            "The saved Telegram session is empty. Run .telegram login <phone> again."
        )

    client = TelegramClient(
        StringSession(telegram_session),
        API_ID,
        API_HASH
    )

    print(
        f"TELEGRAM: API ID loaded = {bool(API_ID)}",
        flush=True
    )

    print(
        f"TELEGRAM: API HASH loaded = {bool(API_HASH)}",
        flush=True
    )

    print(
        f"TELEGRAM: saved session file exists = {os.path.isfile(SESSION_FILE)}",
        flush=True
    )

    print(
        "TELEGRAM: starting client...",
        flush=True
    )

    try:
        await client.connect()

        if not await client.is_user_authorized():
            raise RuntimeError(
                "The saved Telegram session is not authorized. "
                "Run .telegram login <phone> again."
            )

        print(
            "TELEGRAM: client started.",
            flush=True
        )

        print(
            f"TELEGRAM: requesting sticker pack {short_name}...",
            flush=True
        )

        sticker_set = await asyncio.wait_for(
            client(
                GetStickerSetRequest(
                    stickerset=InputStickerSetShortName(
                        short_name=short_name
                    ),
                    hash=0
                )
            ),
            timeout=60
        )

        documents = sticker_set.documents

        print(
            f"TELEGRAM: sticker pack received ({len(documents)} stickers).",
            flush=True
        )

        if not documents:
            raise ValueError(
                "Sticker pack is empty."
            )

        downloaded = []

        for index, document in enumerate(
            documents,
            start=1
        ):
            # Telegram's MIME type is not always reliable.
            # Download first, then detect the actual file format.

            filename = os.path.join(
                output_dir,
                f"sticker_{index}.tmp"
            )

            try:
                print(
                    f"TELEGRAM: downloading sticker {index}/{len(documents)}...",
                    flush=True
                )

                downloaded_file = await client.download_media(
                    document,
                    file=filename
                )

                if (
                    downloaded_file
                    and os.path.exists(downloaded_file)
                ):
                    with open(
                        downloaded_file,
                        "rb"
                    ) as handle:
                        header = handle.read(16)

                    if (
                        header[:4] == b"RIFF"
                        and header[8:12] == b"WEBP"
                    ):
                        extension = ".webp"

                    elif header[:4] == b"\x1a\x45\xdf\xa3":
                        extension = ".webm"

                    elif header[:2] == b"\x1f\x8b":
                        extension = ".tgs"

                    else:
                        extension = ".unknown"

                    final_file = os.path.join(
                        output_dir,
                        f"sticker_{index}{extension}"
                    )

                    os.replace(
                        downloaded_file,
                        final_file
                    )

                    downloaded.append(
                        final_file
                    )

                    print(
                        f"TELEGRAM: detected sticker {index} as {extension}",
                        flush=True
                    )

            except Exception as error:
                print(
                    f"WARNING: Sticker {index} failed: {error}",
                    file=sys.stderr,
                    flush=True
                )

        if not downloaded:
            raise ValueError(
                "No stickers could be downloaded."
            )

        print(
            f"TELEGRAM: completed. Downloaded {len(downloaded)} stickers.",
            flush=True
        )

        return downloaded

    finally:
        await client.disconnect()


# ============================================================
# COMMAND-LINE MODE
# ============================================================

if __name__ == "__main__":

    if len(sys.argv) != 3:
        print(
            "Usage: python lib/telegram_stickers.py "
            "<sticker_pack_url> <output_dir>"
        )

        sys.exit(1)

    url = sys.argv[1]

    output_dir = sys.argv[2]

    lock_handle = None

    try:

        # ----------------------------------------------------
        # Prevent multiple Telethon processes from sharing
        # the same SQLite session database.
        # ----------------------------------------------------

        lock_handle = open(
            LOCK_FILE,
            "w"
        )

        try:

            fcntl.flock(
                lock_handle,
                fcntl.LOCK_EX
            )

            print(
                "TELEGRAM: session lock acquired.",
                flush=True
            )

            files = asyncio.run(
                download_stickers(
                    url,
                    output_dir
                )
            )

            for file_path in files:
                print(
                    file_path
                )

        finally:

            fcntl.flock(
                lock_handle,
                fcntl.LOCK_UN
            )

            lock_handle.close()

            print(
                "TELEGRAM: session lock released.",
                flush=True
            )

    except Exception as error:

        print(
            f"ERROR: {error}",
            file=sys.stderr
        )

        sys.exit(1)
