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
    exchange: str = "binance"
    label: str = "Binance"
    api_key: str
    api_secret: str = ""
    symbols: str = "BTCUSDT,ETHUSDT,SOLUSDT"


class ChatIn(BaseModel):
    message: str = Field(min_length=1)


class LeadIn(BaseModel):
    email: str | None = None
    phone: str | None = None
    source: str = "landing"
    ref_code: str | None = None
