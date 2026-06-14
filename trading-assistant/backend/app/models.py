"""ORM models for Mentor Trade."""

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    # Used for position-sizing checks; the user sets it once.
    account_size: Mapped[float] = mapped_column(Float, default=1000.0)
    # Optional Telegram chat id for real-time push alerts.
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    connections: Mapped[list["Connection"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Connection(Base):
    """A read-only link to an exchange account (or the built-in demo feed)."""

    __tablename__ = "connections"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    exchange: Mapped[str] = mapped_column(String(32), default="binance")
    label: Mapped[str] = mapped_column(String(64), default="Binance")

    # api_key == "DEMO" enables the synthetic feed (no real network calls).
    api_key: Mapped[str] = mapped_column(String(255))
    api_secret: Mapped[str] = mapped_column(String(255), default="")
    # Which symbols to pull executed trades for.
    symbols: Mapped[str] = mapped_column(String(255), default="BTCUSDT,ETHUSDT,SOLUSDT")

    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    user: Mapped[User] = relationship(back_populates="connections")


class Trade(Base):
    """A single executed fill, as reported by the exchange."""

    __tablename__ = "trades"
    __table_args__ = (
        UniqueConstraint("user_id", "external_id", name="uq_user_external_trade"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    external_id: Mapped[str] = mapped_column(String(64), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    side: Mapped[str] = mapped_column(String(4))  # BUY / SELL
    price: Mapped[float] = mapped_column(Float)
    qty: Mapped[float] = mapped_column(Float)
    quote_qty: Mapped[float] = mapped_column(Float)  # price * qty
    commission: Mapped[float] = mapped_column(Float, default=0.0)
    trade_time: Mapped[datetime] = mapped_column(DateTime, index=True)


class RoundTrip(Base):
    """A closed position: one or more buys matched (FIFO) against sells."""

    __tablename__ = "round_trips"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    qty: Mapped[float] = mapped_column(Float)
    entry_price: Mapped[float] = mapped_column(Float)
    exit_price: Mapped[float] = mapped_column(Float)
    entry_time: Mapped[datetime] = mapped_column(DateTime, index=True)
    exit_time: Mapped[datetime] = mapped_column(DateTime, index=True)
    notional: Mapped[float] = mapped_column(Float)  # entry_price * qty
    pnl: Mapped[float] = mapped_column(Float)
    pnl_pct: Mapped[float] = mapped_column(Float)
    hold_seconds: Mapped[int] = mapped_column(Integer)
    # Stable fingerprint so repeated syncs don't duplicate closed trades.
    dedup_key: Mapped[str] = mapped_column(String(80), unique=True, index=True)


class Alert(Base):
    """A coaching insight produced by the pattern engine."""

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(12))  # warning / success / info
    title: Mapped[str] = mapped_column(String(120))
    message: Mapped[str] = mapped_column(Text)
    symbol: Mapped[str | None] = mapped_column(String(32), nullable=True)
    dedup_key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    delivered: Mapped[bool] = mapped_column(Boolean, default=False)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(12))  # user / assistant
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)
