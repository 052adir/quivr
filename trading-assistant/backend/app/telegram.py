"""Optional Telegram push so alerts reach the user with no screen open."""

import httpx

from .config import settings


def send_message(chat_id: str, text: str) -> bool:
    """Best-effort send. Returns True on success, never raises."""
    if not settings.telegram_bot_token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        resp = httpx.post(
            url,
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=10,
        )
        return resp.status_code == 200
    except httpx.HTTPError:
        return False
