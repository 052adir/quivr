"""Runtime configuration, loaded once from the environment."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load a .env file sitting next to the backend/ folder if present.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")


class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./mentor_trade.db")

    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "").strip()
    # Sonnet is the default — good answers at a price that survives a 50–100₪/mo plan.
    chat_model: str = os.getenv("MENTOR_CHAT_MODEL", "claude-sonnet-4-6").strip()

    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()

    sync_interval_seconds: int = int(os.getenv("SYNC_INTERVAL_SECONDS", "60"))

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


settings = Settings()
