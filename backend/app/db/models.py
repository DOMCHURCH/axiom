"""SQLAlchemy models — the single source of truth for the Postgres schema.

Alembic owns migrations from this metadata. All numeric quantities use NUMERIC
(exact) rather than float. Any provider value that is unavailable is stored NULL.
"""

from __future__ import annotations

from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import settings
from app.db.base import Base, PKMixin, TimestampMixin

# Reusable column types
Money = Numeric(24, 2)      # revenue, market cap, cash, debt (USD)
Price = Numeric(20, 6)      # OHLCV, prices
Ratio = Numeric(18, 6)      # margins, growth rates, indicator values
Score = Numeric(6, 2)       # 0-100 scores


class Company(PKMixin, TimestampMixin, Base):
    __tablename__ = "companies"

    ticker: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    cik: Mapped[str | None] = mapped_column(String(20), index=True)
    name: Mapped[str | None] = mapped_column(Text)
    exchange: Mapped[str | None] = mapped_column(String(20))
    sector: Mapped[str | None] = mapped_column(String(120))
    industry: Mapped[str | None] = mapped_column(String(160))
    market_cap: Mapped[float | None] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(8), default="USD", server_default="USD")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True)
    last_priced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    prices: Mapped[list["StockPrice"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    financials: Mapped[list["FinancialData"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    filings: Mapped[list["SecFiling"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    news: Mapped[list["NewsArticle"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    technicals: Mapped[list["TechnicalMetric"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    scores: Mapped[list["StockScore"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    reports: Mapped[list["AiReport"]] = relationship(back_populates="company", cascade="all, delete-orphan")


class StockPrice(PKMixin, Base):
    __tablename__ = "stock_prices"
    __table_args__ = (
        UniqueConstraint("company_id", "ts", name="uq_price_company_ts"),
        Index("ix_price_company_ts", "company_id", "ts"),
    )

    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    ts: Mapped[date] = mapped_column(Date, nullable=False)
    open: Mapped[float | None] = mapped_column(Price)
    high: Mapped[float | None] = mapped_column(Price)
    low: Mapped[float | None] = mapped_column(Price)
    close: Mapped[float | None] = mapped_column(Price)
    adj_close: Mapped[float | None] = mapped_column(Price)
    volume: Mapped[int | None] = mapped_column(BigInteger)

    company: Mapped["Company"] = relationship(back_populates="prices")


class FinancialData(PKMixin, TimestampMixin, Base):
    __tablename__ = "financial_data"
    __table_args__ = (
        UniqueConstraint("company_id", "period", "fiscal_date", name="uq_fin_company_period_date"),
    )

    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    period: Mapped[str] = mapped_column(String(10))              # annual | quarter
    fiscal_date: Mapped[date | None] = mapped_column(Date)
    revenue: Mapped[float | None] = mapped_column(Money)
    revenue_growth: Mapped[float | None] = mapped_column(Ratio)
    earnings: Mapped[float | None] = mapped_column(Money)        # net income
    eps: Mapped[float | None] = mapped_column(Ratio)
    gross_margin: Mapped[float | None] = mapped_column(Ratio)
    operating_margin: Mapped[float | None] = mapped_column(Ratio)
    net_margin: Mapped[float | None] = mapped_column(Ratio)
    free_cash_flow: Mapped[float | None] = mapped_column(Money)
    fcf_growth: Mapped[float | None] = mapped_column(Ratio)
    total_debt: Mapped[float | None] = mapped_column(Money)
    cash: Mapped[float | None] = mapped_column(Money)
    roic: Mapped[float | None] = mapped_column(Ratio)
    roe: Mapped[float | None] = mapped_column(Ratio)
    valuation_metrics: Mapped[dict | None] = mapped_column(JSONB)   # pe, ps, pb, ev_ebitda, peg, fcf_yield
    source: Mapped[str | None] = mapped_column(String(20))          # fmp | sec_facts

    company: Mapped["Company"] = relationship(back_populates="financials")


class SecFiling(PKMixin, TimestampMixin, Base):
    __tablename__ = "sec_filings"

    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    accession_no: Mapped[str] = mapped_column(String(30), unique=True)
    filing_type: Mapped[str | None] = mapped_column(String(20))
    filing_date: Mapped[date | None] = mapped_column(Date, index=True)
    period_of_report: Mapped[date | None] = mapped_column(Date)
    url: Mapped[str | None] = mapped_column(Text)
    filing_content: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    embedded: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    company: Mapped["Company"] = relationship(back_populates="filings")
    chunks: Mapped[list["FilingChunk"]] = relationship(back_populates="filing", cascade="all, delete-orphan")


class FilingChunk(PKMixin, Base):
    __tablename__ = "filing_chunks"

    filing_id: Mapped[int] = mapped_column(ForeignKey("sec_filings.id", ondelete="CASCADE"), index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(settings.embedding_dim))

    filing: Mapped["SecFiling"] = relationship(back_populates="chunks")


class NewsArticle(PKMixin, TimestampMixin, Base):
    __tablename__ = "news_articles"
    __table_args__ = (
        UniqueConstraint("company_id", "url", name="uq_news_company_url"),
        Index("ix_news_company_published", "company_id", "published_at"),
    )

    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    headline: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(String(40))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sentiment_score: Mapped[float | None] = mapped_column(Numeric(6, 4))
    sentiment_label: Mapped[str | None] = mapped_column(String(12))

    company: Mapped["Company"] = relationship(back_populates="news")


class TechnicalMetric(PKMixin, TimestampMixin, Base):
    __tablename__ = "technical_metrics"
    __table_args__ = (
        UniqueConstraint("company_id", "as_of", name="uq_tech_company_asof"),
    )

    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    as_of: Mapped[date] = mapped_column(Date)
    rsi: Mapped[float | None] = mapped_column(Ratio)
    macd: Mapped[float | None] = mapped_column(Ratio)
    macd_signal: Mapped[float | None] = mapped_column(Ratio)
    macd_hist: Mapped[float | None] = mapped_column(Ratio)
    sma_20: Mapped[float | None] = mapped_column(Price)
    sma_50: Mapped[float | None] = mapped_column(Price)
    sma_200: Mapped[float | None] = mapped_column(Price)
    ema_12: Mapped[float | None] = mapped_column(Price)
    ema_26: Mapped[float | None] = mapped_column(Price)
    bb_upper: Mapped[float | None] = mapped_column(Price)
    bb_mid: Mapped[float | None] = mapped_column(Price)
    bb_lower: Mapped[float | None] = mapped_column(Price)
    atr: Mapped[float | None] = mapped_column(Ratio)
    volatility: Mapped[float | None] = mapped_column(Ratio)
    momentum: Mapped[float | None] = mapped_column(Ratio)
    drawdown: Mapped[float | None] = mapped_column(Ratio)
    trend_score: Mapped[float | None] = mapped_column(Score)
    extra: Mapped[dict | None] = mapped_column(JSONB)   # avg_dollar_volume, 52w hi/lo, beta

    company: Mapped["Company"] = relationship(back_populates="technicals")


class StockScore(PKMixin, TimestampMixin, Base):
    __tablename__ = "stock_scores"
    __table_args__ = (
        UniqueConstraint("company_id", "as_of", name="uq_score_company_asof"),
        Index("ix_score_asof_total", "as_of", "total_score"),
    )

    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    as_of: Mapped[date] = mapped_column(Date)
    technical_score: Mapped[float | None] = mapped_column(Score)
    fundamental_score: Mapped[float | None] = mapped_column(Score)
    growth_score: Mapped[float | None] = mapped_column(Score)
    value_score: Mapped[float | None] = mapped_column(Score)
    quality_score: Mapped[float | None] = mapped_column(Score)
    risk_score: Mapped[float | None] = mapped_column(Score)
    total_score: Mapped[float | None] = mapped_column(Score)
    rank: Mapped[int | None] = mapped_column(Integer)
    recommendation: Mapped[str | None] = mapped_column(String(16))
    breakdown: Mapped[dict | None] = mapped_column(JSONB)
    scan_run_id: Mapped[int | None] = mapped_column(ForeignKey("scan_runs.id", ondelete="SET NULL"), index=True)

    company: Mapped["Company"] = relationship(back_populates="scores")


class AiReport(PKMixin, TimestampMixin, Base):
    __tablename__ = "ai_reports"
    __table_args__ = (
        Index("ix_report_company_created", "company_id", "created_at"),
    )

    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    model: Mapped[str | None] = mapped_column(String(80))
    company_overview: Mapped[str | None] = mapped_column(Text)
    thesis: Mapped[str | None] = mapped_column(Text)
    bull_case: Mapped[str | None] = mapped_column(Text)
    bear_case: Mapped[str | None] = mapped_column(Text)
    catalysts: Mapped[list | None] = mapped_column(JSONB)
    risks: Mapped[list | None] = mapped_column(JSONB)
    technical_analysis: Mapped[str | None] = mapped_column(Text)
    fundamental_analysis: Mapped[str | None] = mapped_column(Text)
    recommendation: Mapped[str | None] = mapped_column(String(16))
    confidence: Mapped[int | None] = mapped_column(Integer)
    scores_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    tokens_used: Mapped[int | None] = mapped_column(Integer)

    company: Mapped["Company"] = relationship(back_populates="reports")


class Portfolio(PKMixin, TimestampMixin, Base):
    __tablename__ = "portfolio"

    ticker: Mapped[str] = mapped_column(String(20), index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id", ondelete="SET NULL"))
    shares: Mapped[float | None] = mapped_column(Numeric(20, 6))
    entry_price: Mapped[float | None] = mapped_column(Price)
    entry_date: Mapped[date | None] = mapped_column(Date)
    thesis: Mapped[str | None] = mapped_column(Text)
    current_status: Mapped[str] = mapped_column(String(16), default="open", server_default="open")
    notes: Mapped[str | None] = mapped_column(Text)


class ScanRun(PKMixin, TimestampMixin, Base):
    __tablename__ = "scan_runs"

    status: Mapped[str] = mapped_column(String(16), default="queued", server_default="queued", index=True)
    universe_size: Mapped[int | None] = mapped_column(Integer)
    stage: Mapped[str | None] = mapped_column(String(40))
    progress: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    counts: Mapped[dict | None] = mapped_column(JSONB)     # per-stage survivor counts
    params: Mapped[dict | None] = mapped_column(JSONB)     # filters / weights / top_n
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    results: Mapped[list["ScanResult"]] = relationship(back_populates="scan_run", cascade="all, delete-orphan")


class ScanResult(PKMixin, Base):
    __tablename__ = "scan_results"
    __table_args__ = (
        UniqueConstraint("scan_run_id", "company_id", name="uq_scanresult_run_company"),
        Index("ix_scanresult_run_rank", "scan_run_id", "rank"),
    )

    scan_run_id: Mapped[int] = mapped_column(ForeignKey("scan_runs.id", ondelete="CASCADE"), index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    rank: Mapped[int | None] = mapped_column(Integer)
    total_score: Mapped[float | None] = mapped_column(Score)
    sub_scores: Mapped[dict | None] = mapped_column(JSONB)
    recommendation: Mapped[str | None] = mapped_column(String(16))

    scan_run: Mapped["ScanRun"] = relationship(back_populates="results")


class ProviderUsage(Base):
    """Persisted per-day API call counts, so daily budgets survive restarts."""

    __tablename__ = "provider_usage"
    __table_args__ = (
        UniqueConstraint("provider", "day", name="uq_provider_usage_day"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(40), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class AppSetting(TimestampMixin, Base):
    """Tiny key/value store for runtime toggles the UI can flip (e.g. automation
    on/off + recipient) — persists across restarts so the setting sticks."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)


class Job(TimestampMixin, Base):
    """Lightweight async-job tracker read by the api and updated by the background runner."""

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)   # job id (uuid hex)
    type: Mapped[str] = mapped_column(String(40), index=True)       # scan | report | refresh
    status: Mapped[str] = mapped_column(String(16), default="queued", server_default="queued", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    stage: Mapped[str | None] = mapped_column(String(160))
    result_ref: Mapped[dict | None] = mapped_column(JSONB)          # {"scan_run_id":..} | {"report_id":..}
    error: Mapped[str | None] = mapped_column(Text)


# ============================ trading workstation ============================

class TradeRun(PKMixin, TimestampMixin, Base):
    """A 'Find Best Trades' run for a given capital + holding period."""

    __tablename__ = "trade_runs"

    status: Mapped[str] = mapped_column(String(16), default="queued", server_default="queued", index=True)
    capital: Mapped[float | None] = mapped_column(Money)
    horizon: Mapped[str | None] = mapped_column(String(12))          # intraday|1-3d|1w|2w|1m
    universe_size: Mapped[int | None] = mapped_column(Integer)
    stage: Mapped[str | None] = mapped_column(String(48))
    progress: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    counts: Mapped[dict | None] = mapped_column(JSONB)
    params: Mapped[dict | None] = mapped_column(JSONB)
    allocation: Mapped[dict | None] = mapped_column(JSONB)           # portfolio-level summary
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    recommendations: Mapped[list["TradeRecommendation"]] = relationship(
        back_populates="trade_run", cascade="all, delete-orphan")


class TradeRecommendation(PKMixin, TimestampMixin, Base):
    __tablename__ = "trade_recommendations"
    __table_args__ = (
        UniqueConstraint("trade_run_id", "company_id", name="uq_traderec_run_company"),
        Index("ix_traderec_run_rank", "trade_run_id", "rank"),
    )

    trade_run_id: Mapped[int] = mapped_column(ForeignKey("trade_runs.id", ondelete="CASCADE"), index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    ticker: Mapped[str] = mapped_column(String(20), index=True)
    rank: Mapped[int | None] = mapped_column(Integer)
    horizon: Mapped[str | None] = mapped_column(String(12))
    strategy: Mapped[str | None] = mapped_column(String(40))
    strategy_label: Mapped[str | None] = mapped_column(String(48))
    overall_score: Mapped[float | None] = mapped_column(Score)
    confidence: Mapped[int | None] = mapped_column(Integer)
    current_price: Mapped[float | None] = mapped_column(Price)
    risk_level: Mapped[str | None] = mapped_column(String(12))
    expected_rr: Mapped[float | None] = mapped_column(Numeric(8, 2))
    sub_scores: Mapped[dict | None] = mapped_column(JSONB)           # 8 trade sub-scores
    strategy_signals: Mapped[dict | None] = mapped_column(JSONB)     # all strategy fit scores
    setup: Mapped[dict | None] = mapped_column(JSONB)                # entry/stop/targets/rr...
    allocation: Mapped[dict | None] = mapped_column(JSONB)           # weight/dollars/shares
    ai_thesis: Mapped[dict | None] = mapped_column(JSONB)            # thesis/why/risks/summaries

    trade_run: Mapped["TradeRun"] = relationship(back_populates="recommendations")


class ActiveTrade(PKMixin, TimestampMixin, Base):
    """A trade the user is actively holding (research/decision support; no execution)."""

    __tablename__ = "active_trades"

    ticker: Mapped[str] = mapped_column(String(20), index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id", ondelete="SET NULL"))
    strategy: Mapped[str | None] = mapped_column(String(40))
    horizon: Mapped[str | None] = mapped_column(String(12))
    entry_price: Mapped[float | None] = mapped_column(Price)
    stop_loss: Mapped[float | None] = mapped_column(Price)
    target_1: Mapped[float | None] = mapped_column(Price)
    target_2: Mapped[float | None] = mapped_column(Price)
    shares: Mapped[float | None] = mapped_column(Numeric(20, 6))
    opened_at: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="open", server_default="open", index=True)
    original_confidence: Mapped[int | None] = mapped_column(Integer)
    original_thesis: Mapped[str | None] = mapped_column(Text)
    last_review: Mapped[dict | None] = mapped_column(JSONB)          # latest AI thesis re-eval
    notes: Mapped[str | None] = mapped_column(Text)


class TradeAlert(PKMixin, TimestampMixin, Base):
    """A scheduled email alert for a timed/price-triggered trade action.

    Sent by the in-process alert scheduler via AgentMail. `trigger_type` is
    'time' (fire at fire_at) or 'price' (fire when last price crosses price_level
    in the price_op direction). One armed row per action; set to 'sent' after.
    """

    __tablename__ = "trade_alerts"

    ticker: Mapped[str] = mapped_column(String(20), index=True)
    rec_id: Mapped[int | None] = mapped_column(Integer)              # source recommendation (loose)
    email: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))                   # entry|exit|stop|target1|target2
    label: Mapped[str | None] = mapped_column(String(80))
    subject: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    trigger_type: Mapped[str] = mapped_column(String(8))            # time | price
    fire_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    price_op: Mapped[str | None] = mapped_column(String(4))         # gte | lte
    price_level: Mapped[float | None] = mapped_column(Price)
    status: Mapped[str] = mapped_column(String(12), default="armed", server_default="armed", index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    message_id: Mapped[str | None] = mapped_column(String(120))
    position_id: Mapped[int | None] = mapped_column(Integer, index=True)   # linked open position


class Position(PKMixin, TimestampMixin, Base):
    """A real trade the user logged — bought at a price/size, later sold.

    The ledger + 'memory': tracks cost basis, realized P&L on close and unrealized
    P&L while open, and links to the sell alerts armed against the actual shares.
    """

    __tablename__ = "positions"

    ticker: Mapped[str] = mapped_column(String(20), index=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id", ondelete="SET NULL"))
    buy_price: Mapped[float] = mapped_column(Price)
    shares: Mapped[float] = mapped_column(Numeric(20, 6))
    invested: Mapped[float | None] = mapped_column(Money)               # cost basis
    bought_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    horizon: Mapped[str | None] = mapped_column(String(12))
    strategy: Mapped[str | None] = mapped_column(String(48))
    stop_loss: Mapped[float | None] = mapped_column(Price)
    target_1: Mapped[float | None] = mapped_column(Price)
    target_2: Mapped[float | None] = mapped_column(Price)
    source_rec_id: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12), default="open", server_default="open", index=True)
    exit_price: Mapped[float | None] = mapped_column(Price)
    exit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    proceeds: Mapped[float | None] = mapped_column(Money)
    realized_pl: Mapped[float | None] = mapped_column(Money)
    notes: Mapped[str | None] = mapped_column(Text)
