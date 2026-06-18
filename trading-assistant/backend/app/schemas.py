"""Pydantic request/response models."""

from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    # Plain str (not EmailStr) to avoid the email-validator dependency.
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    token: str
    email: str


class SettingsIn(BaseModel):
    account_size: float | None = Field(default=None, gt=0)
    telegram_chat_id: str | None = None


class ConnectionIn(BaseModel):
    # Platform: demo | binance | ccxt | mt5 (api_key == "DEMO" also -> demo).
    provider: str = "binance"
    label: str | None = None
    # crypto (binance / ccxt)
    api_key: str = ""
    api_secret: str = ""
    exchange: str = "binance"  # ccxt exchange id, e.g. binance / bybit / okx / kraken
    symbols: str = "BTCUSDT,ETHUSDT,SOLUSDT"
    # MetaTrader 5
    login: str = ""
    server: str = ""
    password: str = ""  # the read-only *investor* password


class ChatIn(BaseModel):
    message: str = Field(min_length=1)


class LeadIn(BaseModel):
    email: str | None = None
    phone: str | None = None
    source: str = "landing"
    ref_code: str | None = None


class EAEventIn(BaseModel):
    """A live alert pushed by the MT5 MentorGuard Expert Advisor."""
    token: str
    type: str
    message: str
    symbol: str | None = None
    ref: str | None = None
    severity: str = "warning"


class MT5TripIn(BaseModel):
    """One closed round-trip pushed by the EA (read from the terminal)."""
    symbol: str
    qty: float
    entry_price: float
    exit_price: float
    entry_time: int  # epoch seconds
    exit_time: int
    pnl: float
    dedup_key: str


class MT5SyncIn(BaseModel):
    token: str
    trips: list[MT5TripIn]


class WebhookEventIn(BaseModel):
    """A single real-time trade transaction pushed by the MentorTrade EA.

    Sent on every open/close (MT5 OnTradeTransaction). The server runs a live
    rule engine on it (revenge / averaging-down / no-stop) and persists it.
    """
    token: str
    deal_id: int = 0
    position_id: int = 0
    symbol: str = ""
    action: str = ""   # "buy" | "sell"
    entry: str = ""    # "in" (opened) | "out" (closed)
    volume: float = 0.0
    price: float = 0.0
    sl: float = 0.0
    tp: float = 0.0
    profit: float = 0.0
    balance: float = 0.0
    equity: float = 0.0
    free_margin: float = 0.0  # for Margin_Danger
    notional: float = 0.0     # volume * contract size, for Risk_Overload
