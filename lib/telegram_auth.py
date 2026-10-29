#!/usr/bin/env python3
import asyncio
import json
import os
import sys
import time
from pathlib import Path

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    PhoneNumberInvalidError,
    PasswordHashInvalidError,
    FloodWaitError,
)

ROOT = Path.cwd()
AUTH_DIR = ROOT / ".telegram-auth"
SESSION_FILE = AUTH_DIR / "session.string"
PENDING_FILE = AUTH_DIR / "pending.json"
PENDING_TTL = 600
MAX_ATTEMPTS = 5


def emit(ok, key, **extra):
    result = {"ok": ok, "key": key}
    result.update(extra)
    print(json.dumps(result, ensure_ascii=False))


def prepare_dir():
    AUTH_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        AUTH_DIR.chmod(0o700)
    except OSError:
        pass


def secure_write(path, content):
    temp = path.with_suffix(path.suffix + ".tmp")
    fd = os.open(
        str(temp),
        os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
        0o600,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(content)
        os.replace(temp, path)
        try:
            path.chmod(0o600)
        except OSError:
            pass
    finally:
        try:
            temp.unlink(missing_ok=True)
        except OSError:
            pass


def read_pending():
    if not PENDING_FILE.exists():
        return None

    try:
        state = json.loads(PENDING_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        PENDING_FILE.unlink(missing_ok=True)
        return None

    if time.time() > state.get("expires_at", 0):
        PENDING_FILE.unlink(missing_ok=True)
        return None

    return state


def save_pending(state):
    secure_write(
        PENDING_FILE,
        json.dumps(state, ensure_ascii=False),
    )


def remove_pending():
    PENDING_FILE.unlink(missing_ok=True)


def load_api_credentials():
    sys.path.insert(0, str(ROOT))
    from telegram_config import API_ID, API_HASH

    if not API_ID or not API_HASH:
        raise ValueError("Telegram API credentials are not configured.")

    return API_ID, API_HASH


async def action_login(value):
    phone = str(value or "").strip()

    if not phone or not phone.startswith("+") or not phone[1:].isdigit():
        emit(False, "telegram_invalid_phone")
        return

    api_id, api_hash = load_api_credentials()
    client = TelegramClient(StringSession(), api_id, api_hash)

    try:
        await client.connect()

        if await client.is_user_authorized():
            emit(False, "telegram_connected_status")
            return

        sent = await client.send_code_request(phone)

        state = {
            "phone": phone,
            "phone_code_hash": sent.phone_code_hash,
            "session": client.session.save(),
            "expires_at": time.time() + PENDING_TTL,
            "attempts": 0,
        }
        save_pending(state)
        emit(True, "telegram_login_code_sent")
    finally:
        await client.disconnect()


async def action_code(value):
    code = str(value or "").strip().replace(" ", "")

    if not code or not code.isdigit():
        emit(False, "telegram_usage_code")
        return

    state = read_pending()
    if not state:
        emit(False, "telegram_no_pending_login")
        return

    api_id, api_hash = load_api_credentials()
    client = TelegramClient(
        StringSession(state["session"]),
        api_id,
        api_hash,
    )

    try:
        await client.connect()

        try:
            await client.sign_in(
                phone=state["phone"],
                code=code,
                phone_code_hash=state["phone_code_hash"],
            )
        except SessionPasswordNeededError:
            state["session"] = client.session.save()
            state["needs_password"] = True
            save_pending(state)
            emit(True, "telegram_password_required")
            return
        except (PhoneCodeInvalidError, PhoneCodeExpiredError):
            state["attempts"] = state.get("attempts", 0) + 1

            if state["attempts"] >= MAX_ATTEMPTS:
                remove_pending()
                emit(False, "telegram_too_many_codes")
            else:
                save_pending(state)
                emit(False, "telegram_invalid_code")
            return

        if await client.is_user_authorized():
            secure_write(SESSION_FILE, client.session.save())
            remove_pending()
            emit(True, "telegram_connected")
        else:
            emit(False, "telegram_not_connected")
    finally:
        await client.disconnect()


async def action_password(value):
    password = str(value or "")

    if not password:
        emit(False, "telegram_usage_password")
        return

    state = read_pending()
    if not state or not state.get("needs_password"):
        emit(False, "telegram_no_pending_password")
        return

    api_id, api_hash = load_api_credentials()
    client = TelegramClient(
        StringSession(state["session"]),
        api_id,
        api_hash,
    )

    try:
        await client.connect()

        try:
            await client.sign_in(password=password)
        except PasswordHashInvalidError:
            state["attempts"] = state.get("attempts", 0) + 1

            if state["attempts"] >= MAX_ATTEMPTS:
                remove_pending()
                emit(False, "telegram_too_many_passwords")
            else:
                save_pending(state)
                emit(False, "telegram_invalid_password")
            return

        if await client.is_user_authorized():
            secure_write(SESSION_FILE, client.session.save())
            remove_pending()
            emit(True, "telegram_connected")
        else:
            emit(False, "telegram_not_connected")
    finally:
        await client.disconnect()


async def action_status():
    if not SESSION_FILE.exists():
        emit(False, "telegram_login_first")
        return

    api_id, api_hash = load_api_credentials()
    session_string = SESSION_FILE.read_text(encoding="utf-8").strip()

    if not session_string:
        emit(False, "telegram_empty_session")
        return

    client = TelegramClient(
        StringSession(session_string),
        api_id,
        api_hash,
    )

    try:
        await client.connect()

        if not await client.is_user_authorized():
            emit(False, "telegram_expired_session")
            return

        user = await client.get_me()
        label = (
            getattr(user, "username", None)
            or getattr(user, "first_name", None)
            or "connected account"
        )
        emit(True, "telegram_connected_status", account=str(label))
    finally:
        await client.disconnect()


async def action_logout():
    revoked = False

    if SESSION_FILE.exists():
        try:
            api_id, api_hash = load_api_credentials()
            session_string = SESSION_FILE.read_text(
                encoding="utf-8"
            ).strip()

            if session_string:
                client = TelegramClient(
                    StringSession(session_string),
                    api_id,
                    api_hash,
                )
                try:
                    await client.connect()
                    if await client.is_user_authorized():
                        await client.log_out()
                        revoked = True
                finally:
                    await client.disconnect()
        except Exception:
            # Never retain the local credential just because remote
            # revocation failed.
            revoked = False
        finally:
            SESSION_FILE.unlink(missing_ok=True)

    remove_pending()

    if revoked:
        emit(True, "telegram_logout_done")
    else:
        emit(True, "telegram_logout_unconfirmed")


async def main():
    prepare_dir()

    try:
        payload = json.loads(sys.stdin.read() or "{}")
        action = str(payload.get("action", "")).lower()
        value = payload.get("value", "")

        if action == "login":
            await action_login(value)
        elif action == "code":
            await action_code(value)
        elif action == "password":
            await action_password(value)
        elif action == "status":
            await action_status()
        elif action == "logout":
            await action_logout()
        else:
            emit(False, "telegram_unknown_action")

    except PhoneNumberInvalidError:
        emit(False, "telegram_invalid_phone")
    except FloodWaitError as exc:
        emit(False, "telegram_flood_wait", seconds=exc.seconds)
    except (ImportError, ModuleNotFoundError):
        emit(False, "telegram_api_missing")
    except ValueError:
        emit(False, "telegram_api_missing")
    except Exception:
        # Do not print exception details: they may contain sensitive data.
        emit(False, "telegram_helper_error")


if __name__ == "__main__":
    asyncio.run(main())
