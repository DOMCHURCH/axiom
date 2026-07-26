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
    scan_technical_keep: int = 120
    scan_top_n: int = 100
    # Wall-clock cap (seconds) for the rate-limited FMP enrichment stage; names
    # not enriched in time are scored technical-only so the scan always finishes.
    scan_enrich_seconds: int = 75

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
