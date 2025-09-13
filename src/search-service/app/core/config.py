from functools import lru_cache
from typing import List, Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Ritcher Map Search Service"
    APP_VERSION: str = "1.0.0"
    API_V1_PREFIX = "/api/v1"
    DEBUG: bool = False

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    ELASTIC_SEARCH_URL: str = "http://localhost:9200"
    ELASTICSEARCH_INDEX_PREFIX: str = "ritchermap"
    ELASTICSEARCH_MAX_RESULT_WINDOW: int = 10000

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL: int = 3600  # 1 hour

    # Database (for analytics)
    DATABASE_URL: Optional[str] = None

    # External Services
    MARKER_SERVICE_URL: str = "http://marker-service:8080"
    GAME_SERVICE_URL: str = "http://content-management-service:3000"
    USER_SERVICE_URL: str = "http://user-service:3000"

    # ML Settings
    ML_MODEL_PATH: str = "./models"
    SIMILARITY_THRESHOLD: float = 0.7
    MAX_RECOMMENDATIONS: int = 10

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 100

    # Logging
    LOG_LEVEL: str = "INFO"

    # CORS
    ALLOWED_ORIGINS: List[str] = ["*"]

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
