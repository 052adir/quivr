"""Runtime configuration, loaded once from the environment."""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load a .env file sitting next to the backend/ folder if present.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")


class Settings:
    environment: str = os.getenv("MENTOR_ENV", "development").strip()
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./mentor_trade.db")

    # Secret used to derive the encryption key for stored exchange credentials.
    # If unset, a stable key is generated and persisted to backend/.secret_key.
    secret_key: str = os.getenv("MENTOR_SECRET_KEY", "").strip()

    # Public base URL — used to build Stripe success/cancel redirect links.
    app_base_url: str = os.getenv("APP_BASE_URL", "http://localhost:8000").rstrip("/")

    # CORS allowlist (comma-separated). Empty -> same-origin only.
    cors_origins: list[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()
    ]

    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "").strip()
    chat_model: str = os.getenv("MENTOR_CHAT_MODEL", "claude-sonnet-4-6").strip()

    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()

    sync_interval_seconds: int = int(os.getenv("SYNC_INTERVAL_SECONDS", "60"))

    # Subscriptions.
    trial_days: int = int(os.getenv("TRIAL_DAYS", "7"))
    stripe_secret_key: str = os.getenv("STRIPE_SECRET_KEY", "").strip()
    stripe_price_id: str = os.getenv("STRIPE_PRICE_ID", "").strip()
    stripe_webhook_secret: str = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def billing_enabled(self) -> bool:
        return bool(self.stripe_secret_key and self.stripe_price_id)

    @property
    def is_production(self) -> bool:
        return self.environment.lower().startswith("prod")


settings = Settings()
