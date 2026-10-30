from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Config from environment variables, or from service/.env when running locally."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    webhook_secret: str


@lru_cache
def get_settings() -> Settings:
    # Read on first use, not at import, so tests and /health never need the env vars.
    return Settings()
