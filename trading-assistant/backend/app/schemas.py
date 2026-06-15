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
