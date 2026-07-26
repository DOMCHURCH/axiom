"""Application configuration, loaded from environment / .env via pydantic-settings.

A single `settings` object is imported everywhere. It also derives the async
(asyncpg, for FastAPI) and sync (psycopg, for background jobs + Alembic) database URLs
from one `DATABASE_URL`, and normalizes Railway's legacy `postgres://` scheme.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_env_file() -> str:
    """Prefer backend/.env, fall back to repo-root .env."""
    import os

    here = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(here)          # .../backend
    repo_root = os.path.dirname(backend_dir)     # repo root
    for candidate in (os.path.join(backend_dir, ".env"), os.path.join(repo_root, ".env")):
        if os.path.exists(candidate):
            return candidate
    return ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_find_env_file(),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- app ----
    env: str = "development"
    log_level: str = "INFO"
    app_name: str = "AXIOM"
    api_v1_prefix: str = "/api/v1"
    # Comma-separated list of allowed browser origins, or "*" for any (default).
    frontend_origin: str = Field(default="*", alias="FRONTEND_ORIGIN")

    # ---- build identity (Railway injects these; used to spot a stale deploy) ----
    git_sha: str = Field(default="", alias="RAILWAY_GIT_COMMIT_SHA")
    git_branch: str = Field(default="", alias="RAILWAY_GIT_BRANCH")

    # ---- auth ----
    # AXIOM has no login. Leave APP_TOKEN empty to keep the API open (default).
    # Set it to any string to re-enable single-user bearer-token protection.
    app_token: str = Field(default="", alias="APP_TOKEN")

    # ---- infra ----
    database_url: str = Field(default="postgresql://postgres:postgres@localhost:5432/axiom", alias="DATABASE_URL")

    # ---- OpenRouter / AI (BYOK — bring your own OpenRouter key) ----
    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    # Default to a cheap DeepSeek model; override with OPENROUTER_MODEL.
    openrouter_model: str = Field(default="deepseek/deepseek-chat", alias="OPENROUTER_MODEL")
    openrouter_base_url: str = Field(default="https://openrouter.ai/api/v1", alias="OPENROUTER_BASE_URL")
    ai_max_reports_per_run: int = 25
    # Lifetime token cap (safety valve so a runaway loop can't drain the key).
    # Generous by default since DeepSeek is cheap; raise/lower via env.
    ai_token_budget: int = Field(default=100_000_000, alias="AI_TOKEN_BUDGET")
    # Per-day cap for the recurring daily brief (separate from the lifetime cap).
    ai_daily_token_budget: int = Field(default=2_000_000, alias="AI_DAILY_TOKEN_BUDGET")
    ai_brief_enabled: bool = Field(default=False, alias="AI_BRIEF_ENABLED")

    # ---- providers ----
    fmp_api_key: str = Field(default="", alias="FMP_API_KEY")
    fmp_daily_limit: int = 250
    finnhub_api_key: str = Field(default="", alias="FINNHUB_API_KEY")
    finnhub_per_min: int = 60
    polygon_api_key: str = Field(default="", alias="POLYGON_API_KEY")
    polygon_per_min: int = 5
    polygon_per_day: int = 7200
    sec_user_agent: str = Field(default="AXIOM Research 01dominique.c@gmail.com", alias="SEC_USER_AGENT")
    # FRED (St. Louis Fed) — free key, generous limits. Powers the macro/economic feed.
    fred_api_key: str = Field(default="", alias="FRED_API_KEY")

    # ---- AgentMail (email alerts for timed trade actions) ----
    agentmail_api_key: str = Field(default="", alias="AGENTMAIL_API_KEY")
    agentmail_inbox: str = Field(default="", alias="AGENTMAIL_INBOX")   # inbox_id to send from
    agentmail_from_name: str = Field(default="AXIOM", alias="AGENTMAIL_FROM_NAME")
    alert_email: str = Field(default="", alias="ALERT_EMAIL")           # default recipient

    # ---- 24/7 Market Watch (autonomous dip/setup emailer) ----
    watch_enabled: bool = Field(default=False, alias="WATCH_ENABLED")
    watch_email: str = Field(default="", alias="WATCH_EMAIL")            # falls back to alert_email
    watch_capital: float = Field(default=500.0, alias="WATCH_CAPITAL")   # $ to suggest per signal
    watch_horizon: str = Field(default="1w", alias="WATCH_HORIZON")
    watch_interval_min: int = Field(default=30, alias="WATCH_INTERVAL_MIN")
    watch_min_score: float = Field(default=82.0, alias="WATCH_MIN_SCORE")
    watch_min_confidence: int = Field(default=72, alias="WATCH_MIN_CONFIDENCE")
    watch_max_per_day: int = Field(default=12, alias="WATCH_MAX_PER_DAY")
    watch_extended_hours: bool = Field(default=False, alias="WATCH_EXTENDED_HOURS")

    # ---- embeddings ----
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dim: int = 384

    # ---- scanner defaults ----
    universe_min_price: float = 3.0
    universe_min_avg_dollar_volume: float = 1_000_000.0
    universe_min_market_cap: float = 100_000_000.0
    # DEFAULT = the curated ~1.5k liquid shortlist: fast, cacheable, and every
    # name is actually tradable. The UI's second button passes universe="full" to
    # sweep the whole ~10k SEC universe when you want discovery instead of speed.
    scan_universe: str = Field(default="liquid", alias="SCAN_UNIVERSE")
    # Tickers per streaming chunk. Kept small on purpose: the deep stage's time
    # budget and the progress bar are both only re-evaluated between chunks, so a
    # large chunk makes the scan overshoot its budget and look frozen meanwhile.
    scan_price_batch: int = Field(default=50, alias="SCAN_PRICE_BATCH")
    # yfinance issues ONE request per ticker. Concurrency is the only lever, but
    # it cuts both ways: hammering Yahoo from a datacenter IP gets the scan
    # throttled, and a throttled request hangs rather than failing. daddiesmoney
    # ran at yfinance's modest default and never stalled, so stay in that range.
    scan_yf_threads: int = Field(default=8, alias="SCAN_YF_THREADS")
    # Which provider serves price history. 'auto' walks the failover chain in
    # app.data.bars (yahoo -> polygon -> fmp), so a Yahoo block degrades the deep
    # stage instead of ending it. Pin to 'fmp' or 'polygon' to take Yahoo out of
    # the path entirely — the right move if Yahoo has blocked this IP range, since
    # that penalty outlasts any retry. 'yahoo' restores the old behaviour.
    scan_bars_provider: str = Field(default="auto", alias="SCAN_BARS_PROVIDER")
    # Two-pass funnel: snapshot the whole market cheaply (batched quote endpoint),
    # then fetch per-ticker history for the best pre-ranked survivors. This is a
    # CEILING — the deep stage actually runs until scan_deep_seconds is spent, so
    # a fast network analyses more names and a slow one still finishes on time.
    # 0 disables the prefilter and scans every name (much slower).
    # How many names get a per-ticker history request. This is the number that
    # decides whether Yahoo throttles us: daddiesmoney asked for ~255 and was
    # fine, we asked for 900+ and stalled. Keep it in that neighbourhood — the
    # snapshot has already ranked the field, so these are the names that matter.
    scan_prefilter_keep: int = Field(default=400, alias="SCAN_PREFILTER_KEEP")
    # Wall-clock budget for the per-ticker history + technicals stage.
    scan_deep_seconds: int = Field(default=14, alias="SCAN_DEEP_SECONDS")
    # Wall-clock budget for the whole-market snapshot. Partial coverage is fine:
    # the snapshot only gates and pre-ranks, and exact technicals decide later.
    scan_snapshot_seconds: int = Field(default=12, alias="SCAN_SNAPSHOT_SECONDS")
    # Daily bars are memoized for 4h so a RE-scan costs zero Yahoo requests, but
    # only when the candidate set is at most this many names — caching thousands
    # of DataFrames would hold hundreds of MB.
    scan_cache_max: int = Field(default=1000, alias="SCAN_CACHE_MAX")
    # Only the strongest technical candidates get (rate-limited) fundamentals.
    # 6 FMP calls each against a 250/day free tier means ~20 names is also the
    # most we can afford per scan without burning the daily budget in one run.
    scan_technical_keep: int = 20
    # The funnel narrows to a short list of the day's best contenders.
    scan_top_n: int = 10
    # Wall-clock cap (seconds) for the rate-limited FMP enrichment stage; names
    # not enriched in time are scored technical-only so the scan always finishes.
    scan_enrich_seconds: int = 12

    # -------------------------------------------------------------- helpers
    @staticmethod
    def _normalize(url: str) -> str:
        # Railway historically hands out `postgres://`; SQLAlchemy wants `postgresql://`.
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        return url

    @property
    def sync_database_url(self) -> str:
        """psycopg (v3) sync URL — used by background job threads and Alembic."""
        url = self._normalize(self.database_url)
        if url.startswith("postgresql+"):
            # already has a driver; force psycopg for the sync path
            _, _, rest = url.partition("://")
            return "postgresql+psycopg://" + rest
        return url.replace("postgresql://", "postgresql+psycopg://", 1)

    @property
    def async_database_url(self) -> str:
        """asyncpg URL — used by the FastAPI request path."""
        url = self._normalize(self.database_url)
        if url.startswith("postgresql+"):
            _, _, rest = url.partition("://")
            return "postgresql+asyncpg://" + rest
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)

    @property
    def is_prod(self) -> bool:
        return self.env.lower() in ("production", "prod")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
