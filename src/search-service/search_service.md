# Search Service

## Project structure

```markdown
search-service/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   ├── elasticsearch.py
│   │   ├── redis.py
│   ├── models/
│   │   ├── __init__.py
│   │   ├── search.py
│   │   ├── analytics.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── search_service.py
│   │   ├── indexing_service.py
│   │   ├── analytics_service.py
│   │   ├── recommendation_service.py
│   │   └── cache_service.py
│   ├── api/
│   │   ├── __init__.py
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── search.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── search.py
│   │   ├── suggestions.py
│   │   └── analytics.py
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── text_processing.py
│   │   └── cache_keys.py
├── requirements.txt
└── Dockerfile
```

### core

#### config.py

```
from functools import lru_cache
from typing import List, Optional, ClassVar
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Ritcher Map Search Service"
    APP_VERSION: str = "1.0.0"
    API_V1_PREFIX: ClassVar[str] = "/api/v1"
    DEBUG: bool = False

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    ELASTICSEARCH_URL: str = "http://localhost:9200"
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

```

#### elasticsearch.py

```
from elasticsearch import AsyncElasticsearch
from typing import Optional
import logging
from .config import settings

logger = logging.getLogger(__name__)


class ElasticSearchClient:
    def __init__(self):
        self.client: Optional[AsyncElasticsearch] = None

    async def connect(self):
        self.client = AsyncElasticsearch(
            hosts=[settings.ELASTICSEARCH_URL],
            timeout=30,
            max_retries=3,
            retry_on_timeout=True,
        )

        try:
            await self.client.ping()
            logger.info("Successfully connected to Elastic Search")
        except Exception as e:
            logger.error(f"Failed to connect to elastic search: {e}")
            raise

    async def close(self):
        if self.client:
            await self.client.close()

    async def create_indices(self):
        indices = {
            "markers": self.get_marker_mapping(),
            "games": self.get_game_mapping(),
            "categories": self.get_category_mapping(),
            "search_analytics": self.get_analytics_mapping(),
        }

        for index_name, mapping in indices.items():
            full_index_name = f"{settings.ELASTICSEARCH_INDEX_PREFIX}_{index_name}"

            try:
                if not await self.client.indices.exists(index=full_index_name):
                    await self.client.indices.create(
                        index=full_index_name,
                        body=mapping
                    )
                    logger.info(f"Create index: {full_index_name}")
                else:
                    logger.info(f"Index already exists: {full_index_name}")
            except Exception as e:
                logger.error(f"Failed to create index: {full_index_name} {e}")

    def get_marker_mapping(self):
        return {
            "settings": {
                "number_of_shards": 1,
                "number_of_replicas": 1,
                "analysis": {
                    "analyzer": {
                        "marker_analyzer": {
                            "type": "custom",
                            "tokenizer": "standard",
                            "filter": [
                                "lowercase",
                                "stop",
                                "stemmer",
                                "marker_synonym"
                            ]
                        },
                        "autocomplete_analyzer": {
                            "type": "custom",
                            "tokenizer": "keyword",
                            "filter": [
                                "lowercase",
                                "edge_ngram_filter"
                            ]
                        }
                    },
                    "filter": {
                        "edge_ngram_filter": {
                            "type": "edge_ngram",
                            "min_gram": 2,
                            "max_gram": 20
                        },
                        "marker_synonym": {
                            "type": "synonym",
                            "synonyms": [
                                "treasure,chest,loot",
                                "enemy,monster,mob",
                                "npc,character,person"
                            ]
                        }
                    }
                }
            },
            "mappings": {
                "properties": {
                    "id": {"type": "keyword"},
                    "title": {
                        "type": "text",
                        "analyzer": "marker_analyzer",
                        "fields": {
                            "keyword": {"type": "keyword"},
                            "autocomplete": {
                                "type": "text",
                                "analyzer": "autocomplete_analyzer"
                            }
                        }
                    },
                    "description": {
                        "type": "text",
                        "analyzer": "marker_analyzer"
                    },
                    "game_id": {"type": "keyword"},
                    "game_name": {"type": "keyword"},
                    "category_id": {"type": "keyword"},
                    "category_name": {"type": "keyword"},
                    "map_id": {"type": "keyword"},
                    "map_name": {"type": "keyword"},
                    "coordinates": {"type": "geo_point"},
                    "tags": {"type": "keyword"},
                    "difficulty": {"type": "keyword"},
                    "completion_type": {"type": "keyword"},
                    "created_at": {"type": "date"},
                    "updated_at": {"type": "date"},
                    "popularity_score": {"type": "float"},
                    "metadata": {"type": "object"},
                    "search_text": {
                        "type": "text",
                        "analyzer": "marker_analyzer"
                    }
                }
            }
        }

    def get_game_mapping(self):
        return {
            "mappings": {
                "properties": {
                    "id": {"type": "keyword"},
                    "title": {
                        "type": "text",
                        "analyzer": "standard",
                        "fields": {
                            "keyword": {"type": "keyword"},
                            "autocomplete": {
                                "type": "text",
                                "analyzer": "autocomplete_analyzer"
                            }
                        }
                    },
                    "description": {"type": "text"},
                    "developer": {"type": "keyword"},
                    "publisher": {"type": "keyword"},
                    "genres": {"type": "keyword"},
                    "platforms": {"type": "keyword"},
                    "release_date": {"type": "date"},
                    "popularity_score": {"type": "float"},
                    "marker_count": {"type": "integer"},
                    "created_at": {"type": "date"}
                }
            }
        }

    def get_category_mapping(self):
        return {
            "mappings": {
                "properties": {
                    "id": {"type": "keyword"},
                    "name": {
                        "type": "text",
                        "fields": {
                            "keyword": {"type": "keyword"},
                            "autocomplete": {
                                "type": "text",
                                "analyzer": "autocomplete_analyzer"
                            }
                        }
                    },
                    "game_id": {"type": "keyword"},
                    "parent_id": {"type": "keyword"},
                    "icon": {"type": "keyword"},
                    "color": {"type": "keyword"},
                    "marker_count": {"type": "integer"}
                }
            }
        }

    def get_analytics_mapping(self):
        return {
            "mappings": {
                "properties": {
                    "query": {"type": "keyword"},
                    "normalized_query": {"type": "keyword"},
                    "user_id": {"type": "keyword"},
                    "game_id": {"type": "keyword"},
                    "result_count": {"type": "integer"},
                    "clicked_result_id": {"type": "keyword"},
                    "click_position": {"type": "integer"},
                    "timestamp": {"type": "date"},
                    "ip_address": {"type": "ip"},
                    "user_agent": {"type": "text"},
                    "session_id": {"type": "keyword"}
                }
            }
        }


# Global instance
es_client = ElasticSearchClient()


async def get_elasticsearch():
    return es_client.client
```

#### redis.py

```
import redis
from typing import Optional, Any
import json
import pickle
from .config import settings
import logging

logger = logging.getLogger(__name__)


class RedisClient:
    def __init__(self):
        self.client: Optional[redis.Redis] = None

    async def connect(self):
        """Initialize Redis connection"""
        self.client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=False  # We handle encoding manually
        )

        # Test connection
        try:
            await self.client.ping()
            logger.info("Successfully connected to Redis")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise

    async def close(self):
        """Close Redis connection"""
        if self.client:
            await self.client.close()

    async def get(self, key: str) -> Optional[Any]:
        """Get value from Redis"""
        try:
            value = await self.client.get(key)
            if value is None:
                return None

            # Try to deserialize as JSON first, then pickle
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return pickle.loads(value)
        except Exception as e:
            logger.error(f"Error getting key {key}: {e}")
            return None

    async def set(
            self,
            key: str,
            value: Any,
            expire: Optional[int] = None
    ) -> bool:
        """Set value in Redis"""
        try:
            # Try to serialize as JSON first, then pickle
            try:
                serialized = json.dumps(value)
            except (TypeError, ValueError):
                serialized = pickle.dumps(value)

            if expire is None:
                expire = settings.CACHE_TTL

            return await self.client.setex(key, expire, serialized)
        except Exception as e:
            logger.error(f"Error setting key {key}: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete key from Redis"""
        try:
            return await self.client.delete(key) > 0
        except Exception as e:
            logger.error(f"Error deleting key {key}: {e}")
            return False

    async def exists(self, key: str) -> bool:
        """Check if key exists"""
        try:
            return await self.client.exists(key) > 0
        except Exception as e:
            logger.error(f"Error checking key existence {key}: {e}")
            return False

    async def increment(self, key: str, amount: int = 1) -> int:
        """Increment counter"""
        try:
            return await self.client.incrby(key, amount)
        except Exception as e:
            logger.error(f"Error incrementing key {key}: {e}")
            return 0

    async def zadd(self, key: str, mapping: dict) -> int:
        """Add to sorted set"""
        try:
            return await self.client.zadd(key, mapping)
        except Exception as e:
            logger.error(f"Error adding to sorted set {key}: {e}")
            return 0

    async def zrevrange(
            self,
            key: str,
            start: int = 0,
            end: int = -1,
            withscores: bool = False
    ):
        """Get sorted set in reverse order"""
        try:
            return await self.client.zrevrange(key, start, end, withscores=withscores)
        except Exception as e:
            logger.error(f"Error getting sorted set {key}: {e}")
            return []

    async def expire(self, key: str, seconds: int) -> bool:
        """Set expiration for key"""
        try:
            return await self.client.expire(key, seconds)
        except Exception as e:
            logger.error(f"Error setting expiration for key {key}: {e}")
            return False


# Global instance
redis_client = RedisClient()


async def get_redis():
    return redis_client.client
```

### models

#### analytics.py

```
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime


class SearchAnalyticsEvent(BaseModel):
    query: str
    normalized_query: str
    user_id: Optional[str] = None
    game_id: Optional[str] = None
    search_type: str
    result_count: int
    filters_applied: Optional[Dict[str, Any]] = None
    timestamp: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    session_id: Optional[str] = None


class ClickAnalyticsEvent(BaseModel):
    query: str
    result_id: str
    result_type: str
    click_position: int
    user_id: Optional[str] = None
    timestamp: datetime
    session_id: Optional[str] = None


class SearchMetrics(BaseModel):
    total_searches: int
    unique_queries: int
    avg_results_per_query: float
    top_queries: List[Dict[str, Any]]
    zero_result_queries: List[Dict[str, Any]]
    click_through_rate: float
    avg_click_position: float
    time_period: str


class QueryPerformance(BaseModel):
    query: str
    search_count: int
    click_count: int
    click_through_rate: float
    avg_click_position: float
    zero_results_count: int
    first_seen: datetime
    last_seen: datetime
```

#### search.py

```
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class SearchType(str, Enum):
    MARKERS = "markers"
    GAMES = "games"
    CATEGORIES = "categories"
    ALL = "all"


class SortOrder(str, Enum):
    RELEVANCE = "relevance"
    POPULARITY = "popularity"
    CREATED_DATE = "created_date"
    UPDATED_DATE = "updated_date"
    ALPHABETICAL = "alphabetical"


class SearchFilter(BaseModel):
    game_ids: Optional[List[str]] = None
    category_ids: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    difficulty: Optional[List[str]] = None
    completion_type: Optional[List[str]] = None
    date_range: Optional[Dict[str, datetime]] = None
    coordinates_bounds: Optional[Dict[str, float]] = None  # bbox search


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    search_type: SearchType = SearchType.ALL
    filters: Optional[SearchFilter] = None
    sort: SortOrder = SortOrder.RELEVANCE
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)
    include_suggestions: bool = True
    highlight: bool = True


class SearchHit(BaseModel):
    id: str
    source_type: str  # marker, game, category
    title: str
    description: Optional[str] = None
    game_id: Optional[str] = None
    game_name: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    coordinates: Optional[Dict[str, float]] = None
    tags: List[str] = []
    score: float
    highlights: Optional[Dict[str, List[str]]] = None
    metadata: Dict[str, Any] = {}


class SearchResponse(BaseModel):
    hits: List[SearchHit]
    total_hits: int
    page: int
    page_size: int
    total_pages: int
    took_ms: int
    suggestions: Optional[List[str]] = None
    facets: Optional[Dict[str, List[Dict]]] = None


class AutocompleteRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=100)
    search_type: Optional[SearchType] = None
    game_id: Optional[str] = None
    limit: int = Field(10, ge=1, le=50)


class AutocompleteResponse(BaseModel):
    suggestions: List[Dict[str, Any]]
    took_ms: int


class TrendingRequest(BaseModel):
    search_type: Optional[SearchType] = None
    game_id: Optional[str] = None
    time_period: str = "24h"  # 1h, 24h, 7d, 30d
    limit: int = Field(10, ge=1, le=50)


class TrendingResponse(BaseModel):
    trending_queries: List[Dict[str, Any]]
    trending_items: List[SearchHit]
    time_period: str
```

### services

#### analytics.py

```
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import hashlib
import logging

from ..core.elasticsearch import get_elasticsearch
from ..core.config import settings
from ..core.redis import redis_client
from ..models.analytics import (
    SearchAnalyticsEvent, ClickAnalyticsEvent,
    SearchMetrics, QueryPerformance
)
from ..utils.text_processing import TextProcessor

logger = logging.getLogger(__name__)


class AnalyticsService:
    def __init__(self):
        self.text_processor = TextProcessor()

    async def track_search(
            self,
            query: str,
            user_id: Optional[str] = None,
            session_id: Optional[str] = None,
            ip_address: Optional[str] = None,
            result_count: int = 0,
            search_type: str = "all",
            filters: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Track a search event"""
        try:
            es_client = await get_elasticsearch()

            # Normalize query for analytics
            normalized_query = self.text_processor.normalize_query(query)

            # Create analytics event
            event = SearchAnalyticsEvent(
                query=query,
                normalized_query=normalized_query,
                user_id=user_id,
                session_id=session_id,
                ip_address=ip_address,
                result_count=result_count,
                search_type=search_type,
                filters_applied=filters,
                timestamp=datetime.now()
            )

            # Index in Elasticsearch
            await es_client.index(
                index=f"{settings.ELASTICSEARCH_INDEX_PREFIX}_search_analytics",
                body=event.dict()
            )

            # Update Redis counters for real-time analytics
            await self._update_search_counters(normalized_query, result_count)

            # Track trending queries
            await self._update_trending_queries(normalized_query)

            logger.debug(f"Tracked search: {query} -> {result_count} results")
            return True

        except Exception as e:
            logger.error(f"Error tracking search: {e}")
            return False

    async def track_click(
            self,
            query: str,
            result_id: str,
            result_type: str,
            click_position: int,
            user_id: Optional[str] = None,
            session_id: Optional[str] = None
    ) -> bool:
        """Track a click event"""
        try:
            es_client = await get_elasticsearch()

            # Create click event
            event = ClickAnalyticsEvent(
                query=query,
                result_id=result_id,
                result_type=result_type,
                click_position=click_position,
                user_id=user_id,
                session_id=session_id,
                timestamp=datetime.now()
            )

            # Index in Elasticsearch
            await es_client.index(
                index=f"{settings.ELASTICSEARCH_INDEX_PREFIX}_search_analytics",
                body=event.dict()
            )

            # Update click counters
            await self._update_click_counters(query, result_id, click_position)

            logger.debug(f"Tracked click: {query} -> {result_id} at position {click_position}")
            return True

        except Exception as e:
            logger.error(f"Error tracking click: {e}")
            return False

    async def get_search_metrics(
            self,
            time_period: str = "24h",
            game_id: Optional[str] = None
    ) -> SearchMetrics:
        """Get search metrics for a time period"""
        try:
            es_client = await get_elasticsearch()

            # Calculate time range
            end_time = datetime.now()
            if time_period == "1h":
                start_time = end_time - timedelta(hours=1)
            elif time_period == "24h":
                start_time = end_time - timedelta(days=1)
            elif time_period == "7d":
                start_time = end_time - timedelta(days=7)
            elif time_period == "30d":
                start_time = end_time - timedelta(days=30)
            else:
                start_time = end_time - timedelta(days=1)

            # Build query
            query = {
                "size": 0,
                "query": {
                    "bool": {
                        "must": [
                            {
                                "range": {
                                    "timestamp": {
                                        "gte": start_time.isoformat(),
                                        "lte": end_time.isoformat()
                                    }
                                }
                            }
                        ]
                    }
                },
                "aggs": {
                    "total_searches": {
                        "filter": {"exists": {"field": "query"}}
                    },
                    "unique_queries": {
                        "cardinality": {"field": "normalized_query"}
                    },
                    "avg_results": {
                        "avg": {"field": "result_count"}
                    },
                    "top_queries": {
                        "terms": {
                            "field": "normalized_query",
                            "size": 20,
                            "order": {"_count": "desc"}
                        }
                    },
                    "zero_result_queries": {
                        "filter": {"term": {"result_count": 0}},
                        "aggs": {
                            "queries": {
                                "terms": {
                                    "field": "normalized_query",
                                    "size": 10
                                }
                            }
                        }
                    },
                    "clicks": {
                        "filter": {"exists": {"field": "clicked_result_id"}},
                        "aggs": {
                            "total_clicks": {"value_count": {"field": "clicked_result_id"}},
                            "avg_position": {"avg": {"field": "click_position"}}
                        }
                    }
                }
            }

            # Add game filter if specified
            if game_id:
                query["query"]["bool"]["must"].append(
                    {"term": {"game_id": game_id}}
                )

            response = await es_client.search(
                index=f"{settings.ELASTICSEARCH_INDEX_PREFIX}_search_analytics",
                body=query
            )

            # Process aggregations
            aggs = response["aggregations"]
            total_searches = aggs["total_searches"]["doc_count"]
            total_clicks = aggs["clicks"]["total_clicks"]["value"] if "total_clicks" in aggs["clicks"] else 0

            # Calculate CTR
            click_through_rate = (total_clicks / total_searches) if total_searches > 0 else 0

            # Format top queries
            top_queries = [
                {"query": bucket["key"], "count": bucket["doc_count"]}
                for bucket in aggs["top_queries"]["buckets"]
            ]

            # Format zero result queries
            zero_result_queries = []
            if "queries" in aggs["zero_result_queries"]:
                zero_result_queries = [
                    {"query": bucket["key"], "count": bucket["doc_count"]}
                    for bucket in aggs["zero_result_queries"]["queries"]["buckets"]
                ]

            return SearchMetrics(
                total_searches=total_searches,
                unique_queries=aggs["unique_queries"]["value"],
                avg_results_per_query=aggs["avg_results"]["value"] or 0,
                top_queries=top_queries,
                zero_result_queries=zero_result_queries,
                click_through_rate=click_through_rate,
                avg_click_position=aggs["clicks"]["avg_position"]["value"] or 0,
                time_period=time_period
            )

        except Exception as e:
            logger.error(f"Error getting search metrics: {e}")
            return SearchMetrics(
                total_searches=0,
                unique_queries=0,
                avg_results_per_query=0,
                top_queries=[],
                zero_result_queries=[],
                click_through_rate=0,
                avg_click_position=0,
                time_period=time_period
            )

    async def get_query_performance(
            self,
            query: str,
            time_period: str = "7d"
    ) -> QueryPerformance:
        """Get performance metrics for a specific query"""
        try:
            es_client = await get_elasticsearch()
            normalized_query = self.text_processor.normalize_query(query)

            # Calculate time range
            end_time = datetime.now()
            if time_period == "7d":
                start_time = end_time - timedelta(days=7)
            elif time_period == "30d":
                start_time = end_time - timedelta(days=30)
            else:
                start_time = end_time - timedelta(days=7)

            query_body = {
                "size": 0,
                "query": {
                    "bool": {
                        "must": [
                            {"term": {"normalized_query": normalized_query}},
                            {
                                "range": {
                                    "timestamp": {
                                        "gte": start_time.isoformat(),
                                        "lte": end_time.isoformat()
                                    }
                                }
                            }
                        ]
                    }
                },
                "aggs": {
                    "searches": {
                        "filter": {"exists": {"field": "query"}}
                    },
                    "clicks": {
                        "filter": {"exists": {"field": "clicked_result_id"}},
                        "aggs": {
                            "avg_position": {"avg": {"field": "click_position"}}
                        }
                    },
                    "zero_results": {
                        "filter": {"term": {"result_count": 0}}
                    },
                    "date_range": {
                        "stats": {"field": "timestamp"}
                    }
                }
            }

            response = await es_client.search(
                index=f"{settings.ELASTICSEARCH_INDEX_PREFIX}_search_analytics",
                body=query_body
            )

            aggs = response["aggregations"]
            search_count = aggs["searches"]["doc_count"]
            click_count = aggs["clicks"]["doc_count"]
            zero_results_count = aggs["zero_results"]["doc_count"]

            # Calculate metrics
            ctr = (click_count / search_count) if search_count > 0 else 0
            avg_click_position = aggs["clicks"]["avg_position"]["value"] if click_count > 0 else 0

            # Get first and last seen dates
            date_stats = aggs["date_range"]
            first_seen = datetime.fromtimestamp(date_stats["min"] / 1000) if date_stats["min"] else datetime.now()
            last_seen = datetime.fromtimestamp(date_stats["max"] / 1000) if date_stats["max"] else datetime.now()

            return QueryPerformance(
                query=query,
                search_count=search_count,
                click_count=click_count,
                click_through_rate=ctr,
                avg_click_position=avg_click_position,
                zero_results_count=zero_results_count,
                first_seen=first_seen,
                last_seen=last_seen
            )

        except Exception as e:
            logger.error(f"Error getting query performance: {e}")
            return QueryPerformance(
                query=query,
                search_count=0,
                click_count=0,
                click_through_rate=0,
                avg_click_position=0,
                zero_results_count=0,
                first_seen=datetime.now(),
                last_seen=datetime.now()
            )

    async def get_trending_queries(
            self,
            time_period: str = "24h",
            limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get trending queries for a time period"""
        cache_key = f"trending:queries:{time_period}:{limit}"

        # Try cache first
        cached = await redis_client.get(cache_key)
        if cached:
            return cached

        try:
            es_client = await get_elasticsearch()

            # Calculate time range
            end_time = datetime.now()
            if time_period == "1h":
                start_time = end_time - timedelta(hours=1)
            elif time_period == "24h":
                start_time = end_time - timedelta(days=1)
            elif time_period == "7d":
                start_time = end_time - timedelta(days=7)
            else:
                start_time = end_time - timedelta(days=1)

            query = {
                "size": 0,
                "query": {
                    "bool": {
                        "must": [
                            {"exists": {"field": "query"}},
                            {
                                "range": {
                                    "timestamp": {
                                        "gte": start_time.isoformat(),
                                        "lte": end_time.isoformat()
                                    }
                                }
                            }
                        ]
                    }
                },
                "aggs": {
                    "trending_queries": {
                        "terms": {
                            "field": "normalized_query",
                            "size": limit,
                            "order": {"_count": "desc"}
                        },
                        "aggs": {
                            "avg_results": {"avg": {"field": "result_count"}},
                            "total_clicks": {
                                "filter": {"exists": {"field": "clicked_result_id"}}
                            }
                        }
                    }
                }
            }

            response = await es_client.search(
                index=f"{settings.ELASTICSEARCH_INDEX_PREFIX}_search_analytics",
                body=query
            )

            trending = []
            for bucket in response["aggregations"]["trending_queries"]["buckets"]:
                search_count = bucket["doc_count"]
                click_count = bucket["total_clicks"]["doc_count"]

                trending.append({
                    "query": bucket["key"],
                    "search_count": search_count,
                    "avg_results": bucket["avg_results"]["value"] or 0,
                    "click_count": click_count,
                    "click_through_rate": (click_count / search_count) if search_count > 0 else 0
                })

            # Cache for 5 minutes
            await redis_client.set(cache_key, trending, expire=300)

            return trending

        except Exception as e:
            logger.error(f"Error getting trending queries: {e}")
            return []

    async def get_popular_items(
            self,
            item_type: str,
            time_period: str = "24h",
            limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get popular items based on click analytics"""
        cache_key = f"trending:items:{item_type}:{time_period}:{limit}"

        # Try cache first
        cached = await redis_client.get(cache_key)
        if cached:
            return cached

        try:
            es_client = await get_elasticsearch()

            # Calculate time range
            end_time = datetime.now()
            if time_period == "1h":
                start_time = end_time - timedelta(hours=1)
            elif time_period == "24h":
                start_time = end_time - timedelta(days=1)
            elif time_period == "7d":
                start_time = end_time - timedelta(days=7)
            else:
                start_time = end_time - timedelta(days=1)

            query = {
                "size": 0,
                "query": {
                    "bool": {
                        "must": [
                            {"exists": {"field": "clicked_result_id"}},
                            {
                                "range": {
                                    "timestamp": {
                                        "gte": start_time.isoformat(),
                                        "lte": end_time.isoformat()
                                    }
                                }
                            }
                        ]
                    }
                },
                "aggs": {
                    "popular_items": {
                        "terms": {
                            "field": "clicked_result_id",
                            "size": limit * 2,  # Get more to filter by type
                            "order": {"_count": "desc"}
                        },
                        "aggs": {
                            "avg_position": {"avg": {"field": "click_position"}},
                            "unique_queries": {"cardinality": {"field": "normalized_query"}}
                        }
                    }
                }
            }

            # Add result type filter if specified
            if item_type and item_type != "all":
                query["query"]["bool"]["must"].append(
                    {"term": {"result_type": item_type}}
                )

            response = await es_client.search(
                index=f"{settings.ELASTICSEARCH_INDEX_PREFIX}_search_analytics",
                body=query
            )

            popular = []
            for bucket in response["aggregations"]["popular_items"]["buckets"]:
                popular.append({
                    "item_id": bucket["key"],
                    "click_count": bucket["doc_count"],
                    "avg_click_position": bucket["avg_position"]["value"] or 0,
                    "unique_queries": bucket["unique_queries"]["value"]
                })

            # Limit to requested count
            popular = popular[:limit]

            # Cache for 10 minutes
            await redis_client.set(cache_key, popular, expire=600)

            return popular

        except Exception as e:
            logger.error(f"Error getting popular items: {e}")
            return []

    async def _update_search_counters(self, query: str, result_count: int):
        """Update Redis counters for real-time analytics"""
        try:
            # Update daily search counter
            today = datetime.now().strftime("%Y-%m-%d")
            await redis_client.increment(f"search:count:{today}")

            # Update query-specific counter
            query_key = f"search:query:{hashlib.md5(query.encode()).hexdigest()}"
            await redis_client.increment(query_key)

            # Track zero result queries
            if result_count == 0:
                await redis_client.increment(f"search:zero_results:{today}")

        except Exception as e:
            logger.error(f"Error updating search counters: {e}")

    async def _update_click_counters(self, query: str, result_id: str, position: int):
        """Update Redis counters for click analytics"""
        try:
            # Update daily click counter
            today = datetime.now().strftime("%Y-%m-%d")
            await redis_client.increment(f"clicks:count:{today}")

            # Update result-specific counter
            result_key = f"clicks:result:{result_id}"
            await redis_client.increment(result_key)

            # Update position analytics
            position_key = f"clicks:position:{position}:{today}"
            await redis_client.increment(position_key)

        except Exception as e:
            logger.error(f"Error updating click counters: {e}")

    async def _update_trending_queries(self, query: str):
        """Update trending queries in Redis sorted set"""
        try:
            current_hour = datetime.now().strftime("%Y-%m-%d-%H")
            trending_key = f"trending:queries:{current_hour}"

            # Add to sorted set with score as count
            await redis_client.zadd(trending_key, {query: 1})

            # Set expiration for 25 hours
            await redis_client.expire(trending_key, 90000)

        except Exception as e:
            logger.error(f"Error updating trending queries: {e}")


# Global instance
analytics_service = AnalyticsService()
```

#### cache_service.py

```
from typing import Any, Optional, List, Dict
import hashlib
import logging

from ..core.redis import redis_client
from ..core.config import settings
from ..utils.cache_keys import CacheKeyBuilder

logger = logging.getLogger(__name__)


class CacheService:
    def __init__(self):
        self.key_builder = CacheKeyBuilder()
        self.default_ttl = settings.CACHE_TTL

        # Cache TTL configurations for different data types
        self.ttl_config = {
            "search": 300,      # 5 minutes
            "autocomplete": 600, # 10 minutes
            "trending": 300,    # 5 minutes
            "recommendations": 1800,  # 30 minutes
            "analytics": 600,   # 10 minutes
            "popular": 900,     # 15 minutes
            "user_session": 3600,    # 1 hour
            "api_response": 300, # 5 minutes
            "counters": 86400,  # 24 hours
        }

    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        try:
            value = await redis_client.get(key)
            return value
        except Exception as e:
            logger.error(f"Cache get error for key {key}: {e}")
            return None

    async def set(
            self,
            key: str,
            value: Any,
            expire: Optional[int] = None,
            cache_type: str = "default"
    ) -> bool:
        """Set value in cache with automatic TTL"""
        try:
            if expire is None:
                expire = self.ttl_config.get(cache_type, self.default_ttl)

            success = await redis_client.set(key, value, expire=expire)

            if success:
                logger.debug(f"Cached key {key} with TTL {expire}s")

            return success

        except Exception as e:
            logger.error(f"Cache set error for key {key}: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete key from cache"""
        try:
            return await redis_client.delete(key)
        except Exception as e:
            logger.error(f"Cache delete error for key {key}: {e}")
            return False

    async def exists(self, key: str) -> bool:
        """Check if key exists in cache"""
        try:
            return await redis_client.exists(key)
        except Exception as e:
            logger.error(f"Cache exists error for key {key}: {e}")
            return False

    async def get_many(self, keys: List[str]) -> Dict[str, Any]:
        """Get multiple values from cache"""
        result = {}

        for key in keys:
            value = await self.get(key)
            if value is not None:
                result[key] = value

        return result

    async def set_many(
            self,
            items: Dict[str, Any],
            expire: Optional[int] = None,
            cache_type: str = "default"
    ) -> Dict[str, bool]:
        """Set multiple values in cache"""
        results = {}

        for key, value in items.items():
            results[key] = await self.set(key, value, expire, cache_type)

        return results

    async def delete_many(self, keys: List[str]) -> Dict[str, bool]:
        """Delete multiple keys from cache"""
        results = {}

        for key in keys:
            results[key] = await self.delete(key)

        return results

    async def delete_pattern(self, pattern: str) -> int:
        """Delete keys matching pattern"""
        try:
            # Get all keys matching pattern
            keys = await redis_client.client.keys(pattern)

            if not keys:
                return 0

            # Delete all matching keys
            deleted_count = await redis_client.client.delete(*keys)
            logger.debug(f"Deleted {deleted_count} keys matching pattern {pattern}")

            return deleted_count

        except Exception as e:
            logger.error(f"Cache delete pattern error for {pattern}: {e}")
            return 0

    async def increment(self, key: str, amount: int = 1) -> int:
        """Increment counter in cache"""
        try:
            return await redis_client.increment(key, amount)
        except Exception as e:
            logger.error(f"Cache increment error for key {key}: {e}")
            return 0

    async def expire(self, key: str, seconds: int) -> bool:
        """Set expiration time for key"""
        try:
            return await redis_client.expire(key, seconds)
        except Exception as e:
            logger.error(f"Cache expire error for key {key}: {e}")
            return False

    # Specialized cache methods for different data types

    async def cache_search_results(
            self,
            query: str,
            filters: Optional[Dict] = None,
            sort: str = "relevance",
            page: int = 1,
            page_size: int = 20,
            results: Any = None
    ) -> str:
        """Cache search results with structured key"""
        cache_key = self.key_builder.search_results_key(
            query=query,
            filters=filters,
            sort=sort,
            page=page,
            page_size=page_size
        )

        await self.set(cache_key, results, cache_type="search")
        return cache_key

    async def get_cached_search_results(
            self,
            query: str,
            filters: Optional[Dict] = None,
            sort: str = "relevance",
            page: int = 1,
            page_size: int = 20
    ) -> Optional[Any]:
        """Get cached search results"""
        cache_key = self.key_builder.search_results_key(
            query=query,
            filters=filters,
            sort=sort,
            page=page,
            page_size=page_size
        )

        return await self.get(cache_key)

    async def cache_autocomplete_suggestions(
            self,
            query: str,
            search_type: Optional[str] = None,
            suggestions: List[Dict] = None
    ) -> str:
        """Cache autocomplete suggestions"""
        cache_key = self.key_builder.autocomplete_key(query, search_type)
        await self.set(cache_key, suggestions, cache_type="autocomplete")
        return cache_key

    async def get_cached_autocomplete_suggestions(
            self,
            query: str,
            search_type: Optional[str] = None
    ) -> Optional[List[Dict]]:
        """Get cached autocomplete suggestions"""
        cache_key = self.key_builder.autocomplete_key(query, search_type)
        return await self.get(cache_key)

    async def cache_recommendations(
            self,
            user_id: Optional[str] = None,
            item_id: Optional[str] = None,
            item_type: str = "marker",
            strategy: str = "hybrid",
            recommendations: List[Dict] = None
    ) -> str:
        """Cache recommendations"""
        cache_key = self.key_builder.recommendations_key(
            user_id=user_id,
            item_id=item_id,
            item_type=item_type,
            strategy=strategy
        )

        await self.set(cache_key, recommendations, cache_type="recommendations")
        return cache_key

    async def get_cached_recommendations(
            self,
            user_id: Optional[str] = None,
            item_id: Optional[str] = None,
            item_type: str = "marker",
            strategy: str = "hybrid"
    ) -> Optional[List[Dict]]:
        """Get cached recommendations"""
        cache_key = self.key_builder.recommendations_key(
            user_id=user_id,
            item_id=item_id,
            item_type=item_type,
            strategy=strategy
        )

        return await self.get(cache_key)

    async def cache_trending_data(
            self,
            data_type: str,  # queries, items
            time_period: str,
            item_type: Optional[str] = None,
            data: List[Dict] = None
    ) -> str:
        """Cache trending data"""
        cache_key = self.key_builder.trending_key(data_type, time_period, item_type)
        await self.set(cache_key, data, cache_type="trending")
        return cache_key

    async def get_cached_trending_data(
            self,
            data_type: str,
            time_period: str,
            item_type: Optional[str] = None
    ) -> Optional[List[Dict]]:
        """Get cached trending data"""
        cache_key = self.key_builder.trending_key(data_type, time_period, item_type)
        return await self.get(cache_key)

    async def cache_analytics_metrics(
            self,
            metric_type: str,
            time_period: str,
            filters: Optional[Dict] = None,
            metrics: Dict = None
    ) -> str:
        """Cache analytics metrics"""
        cache_key = self.key_builder.analytics_key(metric_type, time_period, filters)
        await self.set(cache_key, metrics, cache_type="analytics")
        return cache_key

    async def get_cached_analytics_metrics(
            self,
            metric_type: str,
            time_period: str,
            filters: Optional[Dict] = None
    ) -> Optional[Dict]:
        """Get cached analytics metrics"""
        cache_key = self.key_builder.analytics_key(metric_type, time_period, filters)
        return await self.get(cache_key)

    async def cache_user_session_data(
            self,
            user_id: str,
            session_data: Dict
    ) -> str:
        """Cache user session data"""
        cache_key = self.key_builder.user_session_key(user_id)
        await self.set(cache_key, session_data, cache_type="user_session")
        return cache_key

    async def get_cached_user_session_data(
            self,
            user_id: str
    ) -> Optional[Dict]:
        """Get cached user session data"""
        cache_key = self.key_builder.user_session_key(user_id)
        return await self.get(cache_key)

    # Cache invalidation methods

    async def invalidate_search_caches(
            self,
            query: Optional[str] = None,
            game_id: Optional[str] = None
    ) -> int:
        """Invalidate search-related caches"""
        patterns = ["search:*"]

        if query:
            query_hash = hashlib.md5(query.encode()).hexdigest()[:8]
            patterns.append(f"search:*{query_hash}*")

        if game_id:
            patterns.append(f"*game:{game_id}*")

        total_deleted = 0
        for pattern in patterns:
            total_deleted += await self.delete_pattern(pattern)

        logger.info(f"Invalidated {total_deleted} search cache keys")
        return total_deleted

    async def invalidate_recommendation_caches(
            self,
            user_id: Optional[str] = None,
            item_id: Optional[str] = None
    ) -> int:
        """Invalidate recommendation caches"""
        patterns = ["recommendations:*"]

        if user_id:
            patterns.append(f"recommendations:*{user_id}*")

        if item_id:
            patterns.append(f"recommendations:*{item_id}*")

        total_deleted = 0
        for pattern in patterns:
            total_deleted += await self.delete_pattern(pattern)

        logger.info(f"Invalidated {total_deleted} recommendation cache keys")
        return total_deleted

    async def invalidate_trending_caches(self) -> int:
        """Invalidate all trending caches"""
        total_deleted = await self.delete_pattern("trending:*")
        logger.info(f"Invalidated {total_deleted} trending cache keys")
        return total_deleted

    async def invalidate_all_caches(self) -> int:
        """Invalidate all caches (use with caution)"""
        total_deleted = await self.delete_pattern("*")
        logger.warning(f"Invalidated ALL {total_deleted} cache keys")
        return total_deleted

    # Cache statistics and monitoring

    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        try:
            info = await redis_client.client.info()

            # Get key counts by pattern
            key_patterns = {
                "search": "search:*",
                "recommendations": "recommendations:*",
                "trending": "trending:*",
                "analytics": "analytics:*",
                "autocomplete": "autocomplete:*",
                "counters": "counter:*"
            }

            key_counts = {}
            for category, pattern in key_patterns.items():
                keys = await redis_client.client.keys(pattern)
                key_counts[f"{category}_keys"] = len(keys)

            return {
                "redis_version": info.get("redis_version"),
                "connected_clients": info.get("connected_clients"),
                "used_memory": info.get("used_memory"),
                "used_memory_human": info.get("used_memory_human"),
                "keyspace_hits": info.get("keyspace_hits"),
                "keyspace_misses": info.get("keyspace_misses"),
                "total_commands_processed": info.get("total_commands_processed"),
                **key_counts
            }

        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {}

    async def warm_cache(self, cache_type: str = "all"):
        """Pre-warm cache with common queries and data"""
        try:
            if cache_type in ["all", "search"]:
                await self._warm_search_cache()

            if cache_type in ["all", "trending"]:
                await self._warm_trending_cache()

            if cache_type in ["all", "recommendations"]:
                await self._warm_recommendation_cache()

            logger.info(f"Cache warming completed for: {cache_type}")

        except Exception as e:
            logger.error(f"Error warming cache: {e}")

    async def _warm_search_cache(self):
        """Pre-warm search cache with popular queries"""
        # This would typically fetch popular queries from analytics
        # and execute searches to populate the cache
        pass

    async def _warm_trending_cache(self):
        """Pre-warm trending data cache"""
        from ...app.services.analytics_service import analytics_service

        # Pre-fetch trending queries for common time periods
        time_periods = ["1h", "24h", "7d"]
        for period in time_periods:
            trending_queries = await analytics_service.get_trending_queries(period, 20)
            await self.cache_trending_data("queries", period, None, trending_queries)

    async def _warm_recommendation_cache(self):
        """Pre-warm recommendation cache"""
        # This would pre-generate recommendations for active users
        pass


# Global instance
cache_service = CacheService()
```

#### indexing_service.py

```
import asyncio
import httpx
from typing import List, Dict, Any
from datetime import datetime
import logging

from ..core.elasticsearch import get_elasticsearch
from ..core.config import settings
from ..core.redis import redis_client
from ..utils.text_processing import TextProcessor

logger = logging.getLogger(__name__)


class IndexingService:
    def __init__(self):
        self.text_processor = TextProcessor()
        self.client = None

    async def get_http_client(self) -> httpx.AsyncClient:
        """Get HTTP client for external service calls"""
        if not self.client:
            self.client = httpx.AsyncClient(timeout=30.0)
        return self.client

    async def close(self):
        """Close HTTP client"""
        if self.client:
            await self.client.aclose()

    async def index_marker(self, marker_data: Dict[str, Any]) -> bool:
        """Index a single marker document"""
        try:
            es_client = await get_elasticsearch()
            index_name = f"{settings.ELASTICSEARCH_INDEX_PREFIX}_markers"

            # Process marker data for search
            processed_marker = await self._process_marker_for_indexing(marker_data)

            # Index document
            response = await es_client.index(
                index=index_name,
                id=processed_marker["id"],
                body=processed_marker
            )

            logger.info(f"Indexed marker {processed_marker['id']}: {response['result']}")

            # Invalidate related caches
            await self._invalidate_marker_caches(processed_marker)

            return response["result"] in ["created", "updated"]

        except Exception as e:
            logger.error(f"Error indexing marker {marker_data.get('id', 'unknown')}: {e}")
            return False

    async def index_game(self, game_data: Dict[str, Any]) -> bool:
        """Index a single game document"""
        try:
            es_client = await get_elasticsearch()
            index_name = f"{settings.ELASTICSEARCH_INDEX_PREFIX}_games"

            # Process game data for search
            processed_game = await self._process_game_for_indexing(game_data)

            # Index document
            response = await es_client.index(
                index=index_name,
                id=processed_game["id"],
                body=processed_game
            )

            logger.info(f"Indexed game {processed_game['id']}: {response['result']}")

            # Invalidate related caches
            await self._invalidate_game_caches(processed_game)

            return response["result"] in ["created", "updated"]

        except Exception as e:
            logger.error(f"Error indexing game {game_data.get('id', 'unknown')}: {e}")
            return False

    async def index_category(self, category_data: Dict[str, Any]) -> bool:
        """Index a single category document"""
        try:
            es_client = await get_elasticsearch()
            index_name = f"{settings.ELASTICSEARCH_INDEX_PREFIX}_categories"

            # Process category data for search
            processed_category = await self._process_category_for_indexing(category_data)

            # Index document
            response = await es_client.index(
                index=index_name,
                id=processed_category["id"],
                body=processed_category
            )

            logger.info(f"Indexed category {processed_category['id']}: {response['result']}")

            # Invalidate related caches
            await self._invalidate_category_caches(processed_category)

            return response["result"] in ["created", "updated"]

        except Exception as e:
            logger.error(f"Error indexing category {category_data.get('id', 'unknown')}: {e}")
            return False

    async def bulk_index_markers(self, markers: List[Dict[str, Any]]) -> Dict[str, int]:
        """Bulk index multiple markers"""
        if not markers:
            return {"indexed": 0, "failed": 0}

        try:
            es_client = await get_elasticsearch()
            index_name = f"{settings.ELASTICSEARCH_INDEX_PREFIX}_markers"

            # Prepare bulk operations
            operations = []
            for marker in markers:
                processed_marker = await self._process_marker_for_indexing(marker)

                # Add index operation
                operations.append({
                    "index": {
                        "_index": index_name,
                        "_id": processed_marker["id"]
                    }
                })
                operations.append(processed_marker)

            if not operations:
                return {"indexed": 0, "failed": 0}

            # Execute bulk operation
            response = await es_client.bulk(body=operations)

            # Count results
            indexed = 0
            failed = 0

            for item in response["items"]:
                if "index" in item:
                    if item["index"]["status"] in [200, 201]:
                        indexed += 1
                    else:
                        failed += 1
                        logger.error(f"Failed to index marker: {item['index'].get('error', 'Unknown error')}")

            logger.info(f"Bulk indexed markers: {indexed} success, {failed} failed")

            # Invalidate caches after bulk operation
            await self._invalidate_bulk_caches("markers")

            return {"indexed": indexed, "failed": failed}

        except Exception as e:
            logger.error(f"Bulk index markers error: {e}")
            return {"indexed": 0, "failed": len(markers)}

    async def delete_document(self, doc_id: str, doc_type: str) -> bool:
        """Delete a document from the appropriate index"""
        try:
            es_client = await get_elasticsearch()
            index_name = f"{settings.ELASTICSEARCH_INDEX_PREFIX}_{doc_type}"

            response = await es_client.delete(
                index=index_name,
                id=doc_id
            )

            logger.info(f"Deleted {doc_type} {doc_id}: {response['result']}")

            # Invalidate caches
            await self._invalidate_document_caches(doc_id, doc_type)

            return response["result"] == "deleted"

        except Exception as e:
            logger.error(f"Error deleting {doc_type} {doc_id}: {e}")
            return False

    async def reindex_all(self, source_type: str = "all") -> Dict[str, Any]:
        """Reindex all data from source services"""
        logger.info(f"Starting reindex for: {source_type}")

        results = {
            "markers": {"indexed": 0, "failed": 0},
            "games": {"indexed": 0, "failed": 0},
            "categories": {"indexed": 0, "failed": 0}
        }

        try:
            if source_type in ["all", "markers"]:
                markers = await self._fetch_all_markers()
                results["markers"] = await self.bulk_index_markers(markers)

            if source_type in ["all", "games"]:
                games = await self._fetch_all_games()
                for game in games:
                    success = await self.index_game(game)
                    if success:
                        results["games"]["indexed"] += 1
                    else:
                        results["games"]["failed"] += 1

            if source_type in ["all", "categories"]:
                categories = await self._fetch_all_categories()
                for category in categories:
                    success = await self.index_category(category)
                    if success:
                        results["categories"]["indexed"] += 1
                    else:
                        results["categories"]["failed"] += 1

            logger.info(f"Reindex completed: {results}")
            return results

        except Exception as e:
            logger.error(f"Reindex error: {e}")
            return results

    async def _process_marker_for_indexing(self, marker: Dict[str, Any]) -> Dict[str, Any]:
        """Process marker data for optimal search indexing"""
        processed = {
            "id": marker.get("id"),
            "title": marker.get("title", "").strip(),
            "description": marker.get("description", "").strip(),
            "game_id": marker.get("game_id"),
            "game_name": marker.get("game_name", ""),
            "category_id": marker.get("category_id"),
            "category_name": marker.get("category_name", ""),
            "map_id": marker.get("map_id"),
            "map_name": marker.get("map_name", ""),
            "tags": marker.get("tags", []),
            "difficulty": marker.get("difficulty"),
            "completion_type": marker.get("completion_type"),
            "created_at": marker.get("created_at", datetime.now().isoformat()),
            "updated_at": marker.get("updated_at", datetime.now().isoformat()),
            "popularity_score": marker.get("popularity_score", 0.0),
            "metadata": marker.get("metadata", {})
        }

        # Handle coordinates
        if marker.get("coordinates"):
            coords = marker["coordinates"]
            if isinstance(coords, dict) and "lat" in coords and "lon" in coords:
                processed["coordinates"] = {
                    "lat": float(coords["lat"]),
                    "lon": float(coords["lon"])
                }
            elif isinstance(coords, list) and len(coords) == 2:
                processed["coordinates"] = {
                    "lat": float(coords[1]),
                    "lon": float(coords[0])
                }

        # Create search text for better full-text search
        search_text_parts = []

        if processed["title"]:
            search_text_parts.append(processed["title"])
        if processed["description"]:
            search_text_parts.append(processed["description"])
        if processed["category_name"]:
            search_text_parts.append(processed["category_name"])
        if processed["game_name"]:
            search_text_parts.append(processed["game_name"])
        if processed["tags"]:
            search_text_parts.extend(processed["tags"])

        processed["search_text"] = " ".join(search_text_parts)

        return processed

    async def _process_game_for_indexing(self, game: Dict[str, Any]) -> Dict[str, Any]:
        """Process game data for optimal search indexing"""
        processed = {
            "id": game.get("id"),
            "title": game.get("title", "").strip(),
            "description": game.get("description", "").strip(),
            "developer": game.get("developer", ""),
            "publisher": game.get("publisher", ""),
            "genres": game.get("genres", []),
            "platforms": game.get("platforms", []),
            "release_date": game.get("release_date"),
            "created_at": game.get("created_at", datetime.now().isoformat()),
            "popularity_score": game.get("popularity_score", 0.0),
            "marker_count": game.get("marker_count", 0),
            "metadata": game.get("metadata", {})
        }

        return processed

    async def _process_category_for_indexing(self, category: Dict[str, Any]) -> Dict[str, Any]:
        """Process category data for optimal search indexing"""
        processed = {
            "id": category.get("id"),
            "name": category.get("name", "").strip(),
            "game_id": category.get("game_id"),
            "parent_id": category.get("parent_id"),
            "icon": category.get("icon", ""),
            "color": category.get("color", ""),
            "marker_count": category.get("marker_count", 0),
            "metadata": category.get("metadata", {})
        }

        return processed

    async def _fetch_all_markers(self) -> List[Dict[str, Any]]:
        """Fetch all markers from Marker Service"""
        client = await self.get_http_client()
        markers = []
        page = 1
        page_size = 1000

        try:
            while True:
                response = await client.get(
                    f"{settings.MARKER_SERVICE_URL}/api/v1/markers",
                    params={"page": page, "page_size": page_size}
                )
                response.raise_for_status()

                data = response.json()
                batch_markers = data.get("markers", [])

                if not batch_markers:
                    break

                markers.extend(batch_markers)

                # Check if we've reached the last page
                if len(batch_markers) < page_size:
                    break

                page += 1

                # Add small delay to avoid overwhelming the service
                await asyncio.sleep(0.1)

            logger.info(f"Fetched {len(markers)} markers from Marker Service")
            return markers

        except Exception as e:
            logger.error(f"Error fetching markers: {e}")
            return []

    async def _fetch_all_games(self) -> List[Dict[str, Any]]:
        """Fetch all games from Content Management Service"""
        client = await self.get_http_client()
        games = []
        page = 1
        page_size = 100

        try:
            while True:
                response = await client.get(
                    f"{settings.GAME_SERVICE_URL}/api/v1/games",
                    params={"page": page, "page_size": page_size}
                )
                response.raise_for_status()

                data = response.json()
                batch_games = data.get("data", [])

                if not batch_games:
                    break

                games.extend(batch_games)

                if len(batch_games) < page_size:
                    break

                page += 1
                await asyncio.sleep(0.1)

            logger.info(f"Fetched {len(games)} games from Content Management Service")
            return games

        except Exception as e:
            logger.error(f"Error fetching games: {e}")
            return []

    async def _fetch_all_categories(self) -> List[Dict[str, Any]]:
        """Fetch all categories from Content Management Service"""
        client = await self.get_http_client()
        categories = []

        try:
            # Fetch categories for each game
            games = await self._fetch_all_games()

            for game in games:
                game_id = game.get("id")
                response = await client.get(
                    f"{settings.GAME_SERVICE_URL}/api/v1/games/{game_id}/categories"
                )
                response.raise_for_status()

                data = response.json()
                game_categories = data.get("data", [])
                categories.extend(game_categories)

                await asyncio.sleep(0.05)

            logger.info(f"Fetched {len(categories)} categories from Content Management Service")
            return categories

        except Exception as e:
            logger.error(f"Error fetching categories: {e}")
            return []

    async def _invalidate_marker_caches(self, marker: Dict[str, Any]):
        """Invalidate caches related to a marker"""
        cache_keys = [
            f"search:*",  # All search caches
            f"trending:markers:*",
            f"recommendations:*",
            f"game:{marker.get('game_id')}:*",
        ]

        # Use Redis pattern deletion
        for pattern in cache_keys:
            await self._delete_cache_pattern(pattern)

    async def _invalidate_game_caches(self, game: Dict[str, Any]):
        """Invalidate caches related to a game"""
        cache_keys = [
            f"search:*",
            f"trending:games:*",
            f"game:{game.get('id')}:*",
        ]

        for pattern in cache_keys:
            await self._delete_cache_pattern(pattern)

    async def _invalidate_category_caches(self, category: Dict[str, Any]):
        """Invalidate caches related to a category"""
        cache_keys = [
            f"search:*",
            f"trending:categories:*",
            f"game:{category.get('game_id')}:*",
        ]

        for pattern in cache_keys:
            await self._delete_cache_pattern(pattern)

    async def _invalidate_bulk_caches(self, entity_type: str):
        """Invalidate caches after bulk operations"""
        cache_keys = [
            "search:*",
            f"trending:{entity_type}:*",
            "recommendations:*",
        ]

        for pattern in cache_keys:
            await self._delete_cache_pattern(pattern)

    async def _invalidate_document_caches(self, doc_id: str, doc_type: str):
        """Invalidate caches when document is deleted"""
        cache_keys = [
            "search:*",
            f"trending:{doc_type}:*",
            f"recommendations:*:{doc_id}:*",
        ]

        for pattern in cache_keys:
            await self._delete_cache_pattern(pattern)

    async def _delete_cache_pattern(self, pattern: str):
        """Delete cache keys matching pattern"""
        try:
            keys = await redis_client.client.keys(pattern)
            if keys:
                await redis_client.client.delete(*keys)
                logger.debug(f"Deleted {len(keys)} cache keys matching {pattern}")
        except Exception as e:
            logger.error(f"Error deleting cache pattern {pattern}: {e}")


# Global instance
indexing_service = IndexingService()
```

#### recommendation_service.py

```
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.decomposition import TruncatedSVD
from typing import List, Dict, Any, Optional, Tuple
import pickle
import os
from datetime import datetime, timedelta
import logging

from ..core.config import settings
from ..core.elasticsearch import get_elasticsearch
from .cache_service import CacheService

logger = logging.getLogger(__name__)


class RecommendationService:
    def __init__(self):
        self.cache = CacheService()
        self.tfidf_vectorizer = None
        self.content_similarity_matrix = None
        self.svd_model = None
        self.item_features = None
        self.model_last_trained = None

        # Load existing models if available
        self._load_models()

    async def get_recommendations(
            self,
            user_id: Optional[str] = None,
            item_id: Optional[str] = None,
            item_type: str = "marker",
            game_id: Optional[str] = None,
            limit: int = 10,
            strategy: str = "hybrid"
    ) -> List[Dict[str, Any]]:
        """Get recommendations using specified strategy"""

        cache_key = f"recommendations:{user_id or 'anon'}:{item_id or 'none'}:{item_type}:{game_id or 'all'}:{limit}:{strategy}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        try:
            if strategy == "content":
                recommendations = await self._content_based_recommendations(
                    item_id, item_type, game_id, limit
                )
            elif strategy == "collaborative":
                recommendations = await self._collaborative_filtering_recommendations(
                    user_id, item_type, game_id, limit
                )
            elif strategy == "popularity":
                recommendations = await self._popularity_based_recommendations(
                    item_type, game_id, limit
                )
            else:  # hybrid
                recommendations = await self._hybrid_recommendations(
                    user_id, item_id, item_type, game_id, limit
                )

            # Cache for 1 hour
            await self.cache.set(cache_key, recommendations, expire=3600)
            return recommendations

        except Exception as e:
            logger.error(f"Error getting recommendations: {e}")
            # Fallback to popularity-based
            return await self._popularity_based_recommendations(item_type, game_id, limit)

    async def _content_based_recommendations(
            self,
            item_id: str,
            item_type: str,
            game_id: Optional[str],
            limit: int
    ) -> List[Dict[str, Any]]:
        """Content-based recommendations using item similarity"""

        if not self.content_similarity_matrix or not self.item_features:
            await self._train_content_model()

        try:
            # Find item in our features
            item_idx = self.item_features[self.item_features['id'] == item_id].index
            if len(item_idx) == 0:
                # Item not found, fallback to popular items
                return await self._popularity_based_recommendations(item_type, game_id, limit)

            item_idx = item_idx[0]

            # Get similarity scores
            sim_scores = list(enumerate(self.content_similarity_matrix[item_idx]))
            sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)

            # Filter by game if specified
            recommendations = []
            for idx, score in sim_scores[1:limit*2]:  # Get more to filter
                try:
                    item_data = self.item_features.iloc[idx]

                    # Skip if different game and game filter is specified
                    if game_id and item_data.get('game_id') != game_id:
                        continue

                    # Skip if different type
                    if item_data.get('type') != item_type:
                        continue

                    recommendations.append({
                        'id': item_data['id'],
                        'title': item_data['title'],
                        'type': item_data['type'],
                        'game_id': item_data.get('game_id'),
                        'game_name': item_data.get('game_name'),
                        'similarity_score': float(score),
                        'reason': 'Similar content'
                    })

                    if len(recommendations) >= limit:
                        break

                except Exception as e:
                    logger.warning(f"Error processing recommendation {idx}: {e}")
                    continue

            return recommendations

        except Exception as e:
            logger.error(f"Content recommendation error: {e}")
            return []

    async def _collaborative_filtering_recommendations(
            self,
            user_id: Optional[str],
            item_type: str,
            game_id: Optional[str],
            limit: int
    ) -> List[Dict[str, Any]]:
        """Collaborative filtering using user interaction patterns"""

        if not user_id:
            return await self._popularity_based_recommendations(item_type, game_id, limit)

        es_client = await get_elasticsearch()

        try:
            # Get user's interaction history
            user_interactions = await self._get_user_interactions(es_client, user_id)
            if not user_interactions:
                return await self._popularity_based_recommendations(item_type, game_id, limit)

            # Find similar users
            similar_users = await self._find_similar_users(es_client, user_id, user_interactions)

            # Get recommendations based on similar users' interactions
            recommendations = []

            for similar_user_id, similarity_score in similar_users[:20]:  # Top 20 similar users
                similar_user_items = await self._get_user_interactions(es_client, similar_user_id)

                for item in similar_user_items:
                    # Skip items user has already interacted with
                    if item['id'] in [i['id'] for i in user_interactions]:
                        continue

                    # Filter by type and game
                    if item.get('type') != item_type:
                        continue
                    if game_id and item.get('game_id') != game_id:
                        continue

                    # Calculate recommendation score
                    recommendation_score = similarity_score * item.get('interaction_score', 1.0)

                    recommendations.append({
                        'id': item['id'],
                        'title': item['title'],
                        'type': item['type'],
                        'game_id': item.get('game_id'),
                        'game_name': item.get('game_name'),
                        'recommendation_score': float(recommendation_score),
                        'reason': f'Users with similar interests also liked this'
                    })

            # Remove duplicates and sort by score
            seen = set()
            unique_recs = []
            for rec in recommendations:
                if rec['id'] not in seen:
                    seen.add(rec['id'])
                    unique_recs.append(rec)

            unique_recs.sort(key=lambda x: x['recommendation_score'], reverse=True)
            return unique_recs[:limit]

        except Exception as e:
            logger.error(f"Collaborative filtering error: {e}")
            return []

    async def _popularity_based_recommendations(
            self,
            item_type: str,
            game_id: Optional[str],
            limit: int
    ) -> List[Dict[str, Any]]:
        """Popularity-based recommendations"""

        es_client = await get_elasticsearch()

        # Build query for popular items
        query = {
            "size": limit,
            "query": {
                "bool": {
                    "filter": []
                }
            },
            "sort": [
                {"popularity_score": {"order": "desc"}},
                {"_score": {"order": "desc"}}
            ]
        }

        # Add filters
        if game_id:
            query["query"]["bool"]["filter"].append({"term": {"game_id": game_id}})

        # Determine index
        index_map = {
            "marker": f"{settings.ELASTICSEARCH_INDEX_PREFIX}_markers",
            "game": f"{settings.ELASTICSEARCH_INDEX_PREFIX}_games",
            "category": f"{settings.ELASTICSEARCH_INDEX_PREFIX}_categories"
        }

        index = index_map.get(item_type, f"{settings.ELASTICSEARCH_INDEX_PREFIX}_markers")

        try:
            response = await es_client.search(index=index, body=query)

            recommendations = []
            for hit in response["hits"]["hits"]:
                source = hit["_source"]
                recommendations.append({
                    'id': source.get('id'),
                    'title': source.get('title'),
                    'type': item_type,
                    'game_id': source.get('game_id'),
                    'game_name': source.get('game_name'),
                    'popularity_score': source.get('popularity_score', 0),
                    'reason': 'Popular item'
                })

            return recommendations

        except Exception as e:
            logger.error(f"Popularity recommendation error: {e}")
            return []

    async def _hybrid_recommendations(
            self,
            user_id: Optional[str],
            item_id: Optional[str],
            item_type: str,
            game_id: Optional[str],
            limit: int
    ) -> List[Dict[str, Any]]:
        """Hybrid recommendations combining multiple strategies"""

        # Get recommendations from different strategies
        content_recs = []
        collaborative_recs = []
        popularity_recs = await self._popularity_based_recommendations(item_type, game_id, limit)

        if item_id:
            content_recs = await self._content_based_recommendations(item_id, item_type, game_id, limit)

        if user_id:
            collaborative_recs = await self._collaborative_filtering_recommendations(
                user_id, item_type, game_id, limit
            )

        # Combine and weight recommendations
        combined_scores = {}

        # Content-based weight: 0.4
        for rec in content_recs:
            item_id = rec['id']
            score = rec.get('similarity_score', 0) * 0.4
            if item_id not in combined_scores:
                combined_scores[item_id] = {'score': 0, 'data': rec, 'reasons': []}
            combined_scores[item_id]['score'] += score
            combined_scores[item_id]['reasons'].append(rec['reason'])

        # Collaborative weight: 0.4
        for rec in collaborative_recs:
            item_id = rec['id']
            score = rec.get('recommendation_score', 0) * 0.4
            if item_id not in combined_scores:
                combined_scores[item_id] = {'score': 0, 'data': rec, 'reasons': []}
            combined_scores[item_id]['score'] += score
            combined_scores[item_id]['reasons'].append(rec['reason'])

        # Popularity weight: 0.2
        for rec in popularity_recs:
            item_id = rec['id']
            score = rec.get('popularity_score', 0) * 0.2
            if item_id not in combined_scores:
                combined_scores[item_id] = {'score': 0, 'data': rec, 'reasons': []}
            combined_scores[item_id]['score'] += score
            combined_scores[item_id]['reasons'].append(rec['reason'])

        # Sort by combined score and format output
        sorted_items = sorted(
            combined_scores.items(),
            key=lambda x: x[1]['score'],
            reverse=True
        )

        recommendations = []
        for item_id, data in sorted_items[:limit]:
            rec = data['data'].copy()
            rec['recommendation_score'] = data['score']
            rec['reasons'] = list(set(data['reasons']))  # Remove duplicates
            recommendations.append(rec)

        return recommendations

    async def _train_content_model(self):
        """Train content-based recommendation model"""
        logger.info("Training content-based recommendation model...")

        es_client = await get_elasticsearch()

        try:
            # Fetch all items for training
            all_items = []

            # Get markers, games, and categories
            for item_type in ['markers', 'games', 'categories']:
                index = f"{settings.ELASTICSEARCH_INDEX_PREFIX}_{item_type}"

                # Scroll through all documents
                response = await es_client.search(
                    index=index,
                    body={
                        "size": 1000,
                        "query": {"match_all": {}},
                        "_source": ["id", "title", "description", "tags", "game_id", "game_name", "category_name"]
                    },
                    scroll="2m"
                )

                while response["hits"]["hits"]:
                    for hit in response["hits"]["hits"]:
                        source = hit["_source"]

                        # Create feature text
                        feature_text = []
                        if source.get("title"):
                            feature_text.append(source["title"])
                        if source.get("description"):
                            feature_text.append(source["description"])
                        if source.get("tags"):
                            feature_text.extend(source["tags"])
                        if source.get("category_name"):
                            feature_text.append(source["category_name"])

                        all_items.append({
                            "id": source.get("id"),
                            "title": source.get("title", ""),
                            "type": item_type.rstrip('s'),  # Remove 's' from plural
                            "game_id": source.get("game_id"),
                            "game_name": source.get("game_name"),
                            "feature_text": " ".join(feature_text)
                        })

                    # Get next batch
                    scroll_id = response.get("_scroll_id")
                    if not scroll_id:
                        break
                    response = await es_client.scroll(scroll_id=scroll_id, scroll="2m")
                    if not response["hits"]["hits"]:
                        break

            if not all_items:
                logger.warning("No items found for training content model")
                return

            # Create DataFrame
            self.item_features = pd.DataFrame(all_items)

            # Create TF-IDF vectors
            self.tfidf_vectorizer = TfidfVectorizer(
                max_features=5000,
                stop_words='english',
                ngram_range=(1, 2),
                min_df=2,
                max_df=0.8
            )

            tfidf_matrix = self.tfidf_vectorizer.fit_transform(
                self.item_features['feature_text'].fillna('')
            )

            # Reduce dimensionality for large datasets
            if tfidf_matrix.shape[1] > 1000:
                self.svd_model = TruncatedSVD(n_components=500, random_state=42)
                tfidf_matrix = self.svd_model.fit_transform(tfidf_matrix)

            # Calculate similarity matrix
            self.content_similarity_matrix = cosine_similarity(tfidf_matrix)

            self.model_last_trained = datetime.now()

            # Save models
            self._save_models()

            logger.info(f"Content model trained with {len(all_items)} items")

        except Exception as e:
            logger.error(f"Error training content model: {e}")

    async def _get_user_interactions(self, es_client, user_id: str) -> List[Dict[str, Any]]:
        """Get user's interaction history from analytics"""

        # Query search analytics for user interactions
        query = {
            "size": 1000,
            "query": {
                "bool": {
                    "must": [
                        {"term": {"user_id": user_id}},
                        {"exists": {"field": "clicked_result_id"}}
                    ]
                }
            },
            "sort": [{"timestamp": {"order": "desc"}}],
            "aggs": {
                "clicked_items": {
                    "terms": {
                        "field": "clicked_result_id",
                        "size": 100
                    },
                    "aggs": {
                        "interaction_score": {
                            "sum": {"script": "1.0 / (params.position + 1)", "params": {"position": 1}}
                        }
                    }
                }
            }
        }

        try:
            response = await es_client.search(
                index=f"{settings.ELASTICSEARCH_INDEX_PREFIX}_search_analytics",
                body=query
            )

            interactions = []

            # Process aggregated clicks
            if "aggregations" in response:
                for bucket in response["aggregations"]["clicked_items"]["buckets"]:
                    item_id = bucket["key"]
                    interaction_score = bucket["interaction_score"]["value"]

                    # Get item details (would need to fetch from respective index)
                    interactions.append({
                        "id": item_id,
                        "interaction_score": interaction_score,
                        "interaction_count": bucket["doc_count"]
                    })

            return interactions

        except Exception as e:
            logger.error(f"Error getting user interactions: {e}")
            return []

    async def _find_similar_users(
            self,
            es_client,
            user_id: str,
            user_interactions: List[Dict[str, Any]]
    ) -> List[Tuple[str, float]]:
        """Find users with similar interaction patterns"""

        user_items = set([interaction['id'] for interaction in user_interactions])

        # This is a simplified approach - in production, you'd want to use more sophisticated
        # collaborative filtering algorithms like matrix factorization

        query = {
            "size": 0,
            "query": {
                "bool": {
                    "must": [
                        {"terms": {"clicked_result_id": list(user_items)}},
                        {"bool": {"must_not": {"term": {"user_id": user_id}}}}
                    ]
                }
            },
            "aggs": {
                "similar_users": {
                    "terms": {
                        "field": "user_id",
                        "size": 100
                    },
                    "aggs": {
                        "common_items": {
                            "cardinality": {"field": "clicked_result_id"}
                        }
                    }
                }
            }
        }

        try:
            response = await es_client.search(
                index=f"{settings.ELASTICSEARCH_INDEX_PREFIX}_search_analytics",
                body=query
            )

            similar_users = []

            if "aggregations" in response:
                for bucket in response["aggregations"]["similar_users"]["buckets"]:
                    similar_user_id = bucket["key"]
                    common_items_count = bucket["common_items"]["value"]

                    # Calculate Jaccard similarity (simple approach)
                    similarity = common_items_count / len(user_items)

                    if similarity >= settings.SIMILARITY_THRESHOLD:
                        similar_users.append((similar_user_id, similarity))

            # Sort by similarity score
            similar_users.sort(key=lambda x: x[1], reverse=True)
            return similar_users

        except Exception as e:
            logger.error(f"Error finding similar users: {e}")
            return []

    def _save_models(self):
        """Save trained models to disk"""
        try:
            os.makedirs(settings.ML_MODEL_PATH, exist_ok=True)

            model_data = {
                'tfidf_vectorizer': self.tfidf_vectorizer,
                'content_similarity_matrix': self.content_similarity_matrix,
                'svd_model': self.svd_model,
                'item_features': self.item_features,
                'model_last_trained': self.model_last_trained
            }

            model_file = os.path.join(settings.ML_MODEL_PATH, 'content_model.pkl')
            with open(model_file, 'wb') as f:
                pickle.dump(model_data, f)

            logger.info("Models saved successfully")

        except Exception as e:
            logger.error(f"Error saving models: {e}")

    def _load_models(self):
        """Load trained models from disk"""
        try:
            model_file = os.path.join(settings.ML_MODEL_PATH, 'content_model.pkl')

            if os.path.exists(model_file):
                with open(model_file, 'rb') as f:
                    model_data = pickle.load(f)

                self.tfidf_vectorizer = model_data.get('tfidf_vectorizer')
                self.content_similarity_matrix = model_data.get('content_similarity_matrix')
                self.svd_model = model_data.get('svd_model')
                self.item_features = model_data.get('item_features')
                self.model_last_trained = model_data.get('model_last_trained')

                logger.info("Models loaded successfully")
            else:
                logger.info("No saved models found")

        except Exception as e:
            logger.error(f"Error loading models: {e}")

    async def retrain_models_if_needed(self):
        """Retrain models if they're older than 24 hours"""
        if (not self.model_last_trained or
                datetime.now() - self.model_last_trained > timedelta(hours=24)):
            await self._train_content_model()


# Global instance
recommendation_service = RecommendationService()
```

#### search_service.py

```
from typing import List, Dict, Any, Optional
from elasticsearch import AsyncElasticsearch
from ..models.search import (
    SearchRequest, SearchResponse, SearchHit,
    SearchType, SortOrder, SearchFilter
)
from ..core.elasticsearch import get_elasticsearch
from ..core.config import settings
from ..utils.text_processing import TextProcessor
from .analytics_service import AnalyticsService
from .cache_service import CacheService
import time
import logging

logger = logging.getLogger(__name__)


class SearchService:
    def __init__(self):
        self.text_processor = TextProcessor()
        self.analytics = AnalyticsService()
        self.cache = CacheService()

    async def search(
            self,
            request: SearchRequest,
            user_id: Optional[str] = None,
            session_id: Optional[str] = None,
            ip_address: Optional[str] = None
    ) -> SearchResponse:
        """Perform search across indices"""
        start_time = time.time()

        # Check cache first
        cache_key = self._generate_cache_key(request)
        cached_result = await self.cache.get(cache_key)
        if cached_result and not settings.DEBUG:
            cached_result["took_ms"] = int((time.time() - start_time) * 1000)
            return SearchResponse(**cached_result)

        es_client = await get_elasticsearch()

        try:
            # Build Elasticsearch query
            es_query = await self._build_search_query(request)

            # Execute search
            if request.search_type == SearchType.ALL:
                response = await self._multi_index_search(es_client, es_query, request)
            else:
                response = await self._single_index_search(es_client, es_query, request)

            # Process results
            search_response = await self._process_search_results(response, request)

            # Add suggestions if requested
            if request.include_suggestions and search_response.total_hits < 5:
                suggestions = await self._get_search_suggestions(request.query)
                search_response.suggestions = suggestions

            # Cache results
            took_ms = int((time.time() - start_time) * 1000)
            search_response.took_ms = took_ms

            await self.cache.set(cache_key, search_response.dict(), expire=300)  # 5 minutes

            # Track analytics
            await self.analytics.track_search(
                query=request.query,
                user_id=user_id,
                session_id=session_id,
                ip_address=ip_address,
                result_count=search_response.total_hits,
                search_type=request.search_type.value,
                filters=request.filters.dict() if request.filters else None
            )

            return search_response

        except Exception as e:
            logger.error(f"Search error: {e}")
            raise

    async def _build_search_query(self, request: SearchRequest) -> Dict[str, Any]:
        """Build Elasticsearch query from search request"""
        # Process query text
        processed_query = self.text_processor.process_search_query(request.query)

        # Base query structure
        query = {
            "size": request.page_size,
            "from": (request.page - 1) * request.page_size,
            "query": {
                "bool": {
                    "must": [],
                    "filter": [],
                    "should": []
                }
            },
            "_source": {
                "excludes": ["search_text"]
            }
        }

        # Main search query
        if processed_query:
            main_query = {
                "multi_match": {
                    "query": processed_query,
                    "fields": [
                        "title^3",
                        "title.autocomplete^2",
                        "description^1",
                        "search_text^1",
                        "category_name^2",
                        "game_name^1",
                        "tags^2"
                    ],
                    "type": "best_fields",
                    "fuzziness": "AUTO",
                    "operator": "or"
                }
            }
            query["query"]["bool"]["must"].append(main_query)

        # Add filters
        if request.filters:
            await self._add_filters(query, request.filters)

        # Add sorting
        await self._add_sorting(query, request.sort)

        # Add highlighting
        if request.highlight:
            query["highlight"] = {
                "fields": {
                    "title": {},
                    "description": {},
                    "search_text": {}
                },
                "fragment_size": 100,
                "number_of_fragments": 2
            }

        # Add aggregations for facets
        query["aggs"] = {
            "games": {
                "terms": {"field": "game_name", "size": 10}
            },
            "categories": {
                "terms": {"field": "category_name", "size": 20}
            },
            "tags": {
                "terms": {"field": "tags", "size": 50}
            }
        }

        return query

    async def _add_filters(self, query: Dict[str, Any], filters: SearchFilter):
        """Add filters to Elasticsearch query"""
        bool_filter = query["query"]["bool"]["filter"]

        if filters.game_ids:
            bool_filter.append({"terms": {"game_id": filters.game_ids}})

        if filters.category_ids:
            bool_filter.append({"terms": {"category_id": filters.category_ids}})

        if filters.tags:
            bool_filter.append({"terms": {"tags": filters.tags}})

        if filters.difficulty:
            bool_filter.append({"terms": {"difficulty": filters.difficulty}})

        if filters.completion_type:
            bool_filter.append({"terms": {"completion_type": filters.completion_type}})

        if filters.date_range:
            date_filter = {"range": {"created_at": {}}}
            if "start" in filters.date_range:
                date_filter["range"]["created_at"]["gte"] = filters.date_range["start"]
            if "end" in filters.date_range:
                date_filter["range"]["created_at"]["lte"] = filters.date_range["end"]
            bool_filter.append(date_filter)

        if filters.coordinates_bounds:
            geo_filter = {
                "geo_bounding_box": {
                    "coordinates": {
                        "top_left": {
                            "lat": filters.coordinates_bounds["north"],
                            "lon": filters.coordinates_bounds["west"]
                        },
                        "bottom_right": {
                            "lat": filters.coordinates_bounds["south"],
                            "lon": filters.coordinates_bounds["east"]
                        }
                    }
                }
            }
            bool_filter.append(geo_filter)

    async def _add_sorting(self, query: Dict[str, Any], sort: SortOrder):
        """Add sorting to Elasticsearch query"""
        sort_options = {
            SortOrder.RELEVANCE: [{"_score": {"order": "desc"}}],
            SortOrder.POPULARITY: [
                {"popularity_score": {"order": "desc"}},
                {"_score": {"order": "desc"}}
            ],
            SortOrder.CREATED_DATE: [
                {"created_at": {"order": "desc"}},
                {"_score": {"order": "desc"}}
            ],
            SortOrder.UPDATED_DATE: [
                {"updated_at": {"order": "desc"}},
                {"_score": {"order": "desc"}}
            ],
            SortOrder.ALPHABETICAL: [
                {"title.keyword": {"order": "asc"}},
                {"_score": {"order": "desc"}}
            ]
        }

        query["sort"] = sort_options.get(sort, sort_options[SortOrder.RELEVANCE])

    async def _multi_index_search(
            self,
            es_client: AsyncElasticsearch,
            query: Dict[str, Any],
            request: SearchRequest
    ) -> Dict[str, Any]:
        """Search across multiple indices"""
        indices = [
            f"{settings.ELASTICSEARCH_INDEX_PREFIX}_markers",
            f"{settings.ELASTICSEARCH_INDEX_PREFIX}_games",
            f"{settings.ELASTICSEARCH_INDEX_PREFIX}_categories"
        ]

        index_string = ",".join(indices)
        return await es_client.search(index=index_string, body=query)

    async def _single_index_search(
            self,
            es_client: AsyncElasticsearch,
            query: Dict[str, Any],
            request: SearchRequest
    ) -> Dict[str, Any]:
        """Search in a single index"""
        index_map = {
            SearchType.MARKERS: f"{settings.ELASTICSEARCH_INDEX_PREFIX}_markers",
            SearchType.GAMES: f"{settings.ELASTICSEARCH_INDEX_PREFIX}_games",
            SearchType.CATEGORIES: f"{settings.ELASTICSEARCH_INDEX_PREFIX}_categories"
        }

        index = index_map[request.search_type]
        return await es_client.search(index=index, body=query)

    async def _process_search_results(
            self,
            es_response: Dict[str, Any],
            request: SearchRequest
    ) -> SearchResponse:
        """Process Elasticsearch response into SearchResponse"""
        hits = []

        for hit in es_response["hits"]["hits"]:
            source = hit["_source"]

            # Determine source type from index name
            index_name = hit["_index"]
            if "markers" in index_name:
                source_type = "marker"
            elif "games" in index_name:
                source_type = "game"
            elif "categories" in index_name:
                source_type = "category"
            else:
                source_type = "unknown"

            # Extract highlights
            highlights = None
            if "highlight" in hit:
                highlights = {}
                for field, highlight_list in hit["highlight"].items():
                    highlights[field] = highlight_list

            search_hit = SearchHit(
                id=source.get("id", ""),
                source_type=source_type,
                title=source.get("title", ""),
                description=source.get("description"),
                game_id=source.get("game_id"),
                game_name=source.get("game_name"),
                category_id=source.get("category_id"),
                category_name=source.get("category_name"),
                coordinates=source.get("coordinates"),
                tags=source.get("tags", []),
                score=hit["_score"],
                highlights=highlights,
                metadata=source.get("metadata", {})
            )

            hits.append(search_hit)

        # Process facets
        facets = {}
        if "aggregations" in es_response:
            aggs = es_response["aggregations"]
            for agg_name, agg_data in aggs.items():
                if "buckets" in agg_data:
                    facets[agg_name] = [
                        {"key": bucket["key"], "count": bucket["doc_count"]}
                        for bucket in agg_data["buckets"]
                    ]

        total_hits = es_response["hits"]["total"]["value"]
        total_pages = (total_hits + request.page_size - 1) // request.page_size

        return SearchResponse(
            hits=hits,
            total_hits=total_hits,
            page=request.page,
            page_size=request.page_size,
            total_pages=total_pages,
            took_ms=es_response["took"],
            facets=facets
        )

    async def _get_search_suggestions(self, query: str) -> List[str]:
        """Get search suggestions for queries with few results"""
        es_client = await get_elasticsearch()

        # Use completion suggester or similar queries
        suggestion_query = {
            "suggest": {
                "query_suggestion": {
                    "text": query,
                    "term": {
                        "field": "title",
                        "size": 5
                    }
                }
            }
        }

        try:
            response = await es_client.search(
                index=f"{settings.ELASTICSEARCH_INDEX_PREFIX}_*",
                body=suggestion_query
            )

            suggestions = []
            if "suggest" in response:
                for suggestion in response["suggest"]["query_suggestion"]:
                    for option in suggestion["options"]:
                        if option["text"] not in suggestions:
                            suggestions.append(option["text"])

            return suggestions[:5]
        except Exception as e:
            logger.error(f"Error getting suggestions: {e}")
            return []

    def _generate_cache_key(self, request: SearchRequest) -> str:
        """Generate cache key for search request"""
        key_parts = [
            "search",
            request.query,
            request.search_type.value,
            request.sort.value,
            str(request.page),
            str(request.page_size)
        ]

        if request.filters:
            # Add filter hash to cache key
            filter_str = str(sorted(request.filters.dict().items()))
            key_parts.append(str(hash(filter_str)))

        return ":".join(key_parts)


# Global instance
search_service = SearchService()
```


### utils

#### cache_keys.py

```
import hashlib
from typing import Optional, Dict, Any


class CacheKeyBuilder:
    """Utility class to build consistent cache keys"""

    def __init__(self, prefix: str = "ritchermap"):
        self.prefix = prefix

    def _hash_dict(self, data: Optional[Dict[str, Any]]) -> str:
        """Create a hash from dictionary data"""
        if not data:
            return "none"

        # Sort keys for consistent hashing
        sorted_items = sorted(data.items())
        data_str = str(sorted_items)
        return hashlib.md5(data_str.encode()).hexdigest()[:8]

    def _clean_string(self, text: str) -> str:
        """Clean string for use in cache keys"""
        if not text:
            return "none"

        # Create hash for long strings
        if len(text) > 50:
            return hashlib.md5(text.encode()).hexdigest()[:8]

        # Clean special characters
        cleaned = "".join(c for c in text if c.isalnum() or c in "-_")
        return cleaned.lower()

    def search_results_key(
            self,
            query: str,
            filters: Optional[Dict] = None,
            sort: str = "relevance",
            page: int = 1,
            page_size: int = 20
    ) -> str:
        """Build search results cache key"""
        query_clean = self._clean_string(query)
        filters_hash = self._hash_dict(filters)

        return f"{self.prefix}:search:{query_clean}:{filters_hash}:{sort}:{page}:{page_size}"

    def autocomplete_key(
            self,
            query: str,
            search_type: Optional[str] = None
    ) -> str:
        """Build autocomplete cache key"""
        query_clean = self._clean_string(query)
        type_str = search_type or "all"

        return f"{self.prefix}:autocomplete:{query_clean}:{type_str}"

    def recommendations_key(
            self,
            user_id: Optional[str] = None,
            item_id: Optional[str] = None,
            item_type: str = "marker",
            strategy: str = "hybrid"
    ) -> str:
        """Build recommendations cache key"""
        user_str = user_id or "anon"
        item_str = item_id or "none"

        return f"{self.prefix}:recommendations:{user_str}:{item_str}:{item_type}:{strategy}"

    def trending_key(
            self,
            data_type: str,
            time_period: str,
            item_type: Optional[str] = None
    ) -> str:
        """Build trending data cache key"""
        type_str = item_type or "all"

        return f"{self.prefix}:trending:{data_type}:{time_period}:{type_str}"

    def analytics_key(
            self,
            metric_type: str,
            time_period: str,
            filters: Optional[Dict] = None
    ) -> str:
        """Build analytics cache key"""
        filters_hash = self._hash_dict(filters)

        return f"{self.prefix}:analytics:{metric_type}:{time_period}:{filters_hash}"

    def user_session_key(self, user_id: str) -> str:
        """Build user session cache key"""
        return f"{self.prefix}:session:{user_id}"

    def counter_key(self, counter_type: str, date: str) -> str:
        """Build counter cache key"""
        return f"{self.prefix}:counter:{counter_type}:{date}"

    def popular_items_key(
            self,
            item_type: str,
            time_period: str,
            limit: int
    ) -> str:
        """Build popular items cache key"""
        return f"{self.prefix}:popular:{item_type}:{time_period}:{limit}"

```

#### text_processing.py

```
import re
from typing import List, Dict
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.stem import PorterStemmer
import textdistance
import logging

logger = logging.getLogger(__name__)

try:
    nltk.data.find('tokenizers/punkt')
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('punkt')
    nltk.download('stopwords')


class TextProcessor:
    def __init__(self):
        self.stop_words = set(stopwords.words('english'))
        self.stemmer = PorterStemmer()

        self.gaming_stop_words = {
            'game', 'map', 'level', 'area', 'location', 'place', 'item', 'object'
        }

        self.gaming_synonyms = {
            'treasure': ['chest', 'loot', 'reward'],
            'enemy': ['monster', 'mob', 'creature'],
            'npc': ['character', 'person', 'villager'],
            'weapon': ['sword', 'gun', 'blade', 'staff'],
            'armor': ['shield', 'protection', 'gear'],
            'potion': ['elixir', 'brew', 'medicine'],
            'quest': ['mission', 'task', 'objective'],
            'boss': ['final boss', 'end boss', 'big boss']
        }

    def process_search_query(self, query: str) -> str:
        if not query:
            return ""

        processed = self.clean_text(query)
        processed = self.expand_synonyms(processed)

        return processed.strip()

    def normalize_query(self, query: str) -> str:
        """Normalize query for analytics and caching"""
        if not query:
            return ""

        # Convert to lowercase
        normalized = query.lower().strip()

        # Remove extra whitespace
        normalized = re.sub(r'\s+', ' ', normalized)

        # Remove punctuation except useful chars
        normalized = re.sub(r'[^\w\s\-_]', '', normalized)

        # Remove common stop words
        tokens = normalized.split()
        filtered_tokens = [
            token for token in tokens
            if token not in self.stop_words and token not in self.gaming_stop_words
        ]

        return ' '.join(filtered_tokens)

    def clean_text(self, text: str) -> str:
        """Clean text for processing"""
        if not text:
            return ""

        # Convert to lowercase
        cleaned = text.lower()

        # Remove HTML tags if any
        cleaned = re.sub(r'<[^>]+>', '', cleaned)

        # Normalize whitespace
        cleaned = re.sub(r'\s+', ' ', cleaned)

        # Remove extra punctuation but keep useful ones
        cleaned = re.sub(r'[^\w\s\-_\'\".]', ' ', cleaned)

        return cleaned.strip()

    def expand_synonyms(self, text: str) -> str:
        """Expand synonyms in text"""
        words = text.split()
        expanded_words = []

        for word in words:
            expanded_words.append(word)

            # Add synonyms if found
            for key, synonyms in self.gaming_synonyms.items():
                if word == key:
                    expanded_words.extend(synonyms)
                elif word in synonyms:
                    expanded_words.append(key)

        return ' '.join(expanded_words)

    def extract_keywords(self, text: str, max_keywords: int = 10) -> List[str]:
        """Extract keywords from text"""
        if not text:
            return []

        # Clean and tokenize
        cleaned = self.clean_text(text)
        tokens = word_tokenize(cleaned)

        # Filter out stop words and short words
        keywords = [
            token for token in tokens
            if (
                    token not in self.stop_words and
                    token not in self.gaming_stop_words and
                    len(token) > 2 and
                    token.isalpha()
            )
        ]

        # Remove duplicates while preserving order
        seen = set()
        unique_keywords = []
        for keyword in keywords:
            if keyword not in seen:
                seen.add(keyword)
                unique_keywords.append(keyword)

        return unique_keywords[:max_keywords]

    def get_query_suggestions(
            self,
            query: str,
            candidate_queries: List[str],
            max_suggestions: int = 5
    ) -> List[str]:
        """Get query suggestions based on similarity"""
        if not query or not candidate_queries:
            return []

        query_lower = query.lower()
        suggestions = []

        for candidate in candidate_queries:
            candidate_lower = candidate.lower()

            # Skip exact matches
            if query_lower == candidate_lower:
                continue

            # Calculate similarity using different methods
            similarities = [
                textdistance.jaro_winkler(query_lower, candidate_lower),
                textdistance.levenshtein.normalized_similarity(query_lower, candidate_lower),
                textdistance.jaccard.normalized_similarity(
                    set(query_lower.split()),
                    set(candidate_lower.split())
                )
            ]

            # Use maximum similarity
            max_similarity = max(similarities)

            # Include if similarity is above threshold
            if max_similarity > 0.6:
                suggestions.append((candidate, max_similarity))

        # Sort by similarity and return top suggestions
        suggestions.sort(key=lambda x: x[1], reverse=True)
        return [suggestion[0] for suggestion in suggestions[:max_suggestions]]

    def detect_query_intent(self, query: str) -> Dict[str, any]:
        """Detect intent from search query"""
        query_lower = query.lower()

        intent = {
            'type': 'general',
            'entities': [],
            'filters': {},
            'confidence': 0.5
        }

        # Location-based queries
        location_patterns = [
            r'(?:near|around|close to|by)\s+(\w+)',
            r'(?:in|at)\s+(\w+)',
            r'(\w+)\s+(?:area|region|zone)'
        ]

        for pattern in location_patterns:
            matches = re.findall(pattern, query_lower)
            if matches:
                intent['type'] = 'location'
                intent['entities'].extend(matches)
                intent['confidence'] = 0.8

        # Item/collectible queries
        item_keywords = ['treasure', 'chest', 'collectible', 'item', 'loot', 'artifact']
        if any(keyword in query_lower for keyword in item_keywords):
            intent['type'] = 'collectible'
            intent['confidence'] = 0.7

        # Quest/mission queries
        quest_keywords = ['quest', 'mission', 'task', 'objective', 'goal']
        if any(keyword in query_lower for keyword in quest_keywords):
            intent['type'] = 'quest'
            intent['confidence'] = 0.7

        # Character/NPC queries  
        npc_keywords = ['npc', 'character', 'person', 'vendor', 'merchant']
        if any(keyword in query_lower for keyword in npc_keywords):
            intent['type'] = 'npc'
            intent['confidence'] = 0.7

        # Difficulty-based queries
        difficulty_patterns = [
            r'(?:easy|simple|beginner)',
            r'(?:hard|difficult|challenging|expert)',
            r'(?:medium|normal|average)'
        ]

        for i, pattern in enumerate(difficulty_patterns):
            if re.search(pattern, query_lower):
                difficulty_levels = ['easy', 'hard', 'medium']
                intent['filters']['difficulty'] = difficulty_levels[i]
                intent['confidence'] = min(intent['confidence'] + 0.2, 1.0)

        return intent

    def create_search_variations(self, query: str) -> List[str]:
        """Create search query variations"""
        if not query:
            return []

        variations = [query]
        query_lower = query.lower()

        # Add synonym variations
        for original, synonyms in self.gaming_synonyms.items():
            if original in query_lower:
                for synonym in synonyms:
                    variation = query_lower.replace(original, synonym)
                    variations.append(variation)

            for synonym in synonyms:
                if synonym in query_lower:
                    variation = query_lower.replace(synonym, original)
                    variations.append(variation)

        # Add stemmed versions
        tokens = query_lower.split()
        stemmed_tokens = [self.stemmer.stem(token) for token in tokens]
        stemmed_query = ' '.join(stemmed_tokens)
        if stemmed_query != query_lower:
            variations.append(stemmed_query)

        # Remove duplicates
        return list(set(variations))


# Global instance  
text_processor = TextProcessor()

```

### main.py

```
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import uvicorn
import logging
import time

from .core.config import settings
from .core.elasticsearch import es_client
from .core.redis import redis_client
from .api.v1 import search
from .services.recommendation_service import recommendation_service

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("Starting Search Service...")

    try:
        # Connect to Elasticsearch
        await es_client.connect()
        await es_client.create_indices()

        # Connect to Redis
        redis_client.connect()

        # Load/train ML models
        await recommendation_service.retrain_models_if_needed()

        logger.info("Search Service started successfully")

    except Exception as e:
        logger.error(f"Failed to start service: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down Search Service...")
    await es_client.close()
    await redis_client.close()
    logger.info("Search Service shut down successfully")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Search service for MapGenie clone with Elasticsearch and ML recommendations",
    lifespan=lifespan
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time

    logger.info(
        f"{request.method} {request.url} - "
        f"Status: {response.status_code} - "
        f"Time: {process_time:.4f}s"
    )

    return response


# Include routers
app.include_router(
    search.router,
    prefix=settings.API_V1_PREFIX,
    tags=["search"]
)
# 
# app.include_router(
#     suggestions.router,
#     prefix=settings.API_V1_PREFIX,
#     tags=["suggestions"]
# )
# 
# app.include_router(
#     trending.router,
#     prefix=settings.API_V1_PREFIX,
#     tags=["trending"]
# )
# 
# app.include_router(
#     index_router.router,
#     prefix=settings.API_V1_PREFIX,
#     tags=["indexing"]
# )


@app.get("/", tags=["health"])
async def root():
    """Health check endpoint"""
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "healthy"
    }


@app.get("/health", tags=["health"])
async def health_check():
    """Detailed health check"""
    health_status = {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "healthy",
        "dependencies": {}
    }

    # Check Elasticsearch
    try:
        es_health = await es_client.client.cluster.health()
        health_status["dependencies"]["elasticsearch"] = {
            "status": "healthy",
            "cluster_status": es_health["status"]
        }
    except Exception as e:
        health_status["dependencies"]["elasticsearch"] = {
            "status": "unhealthy",
            "error": str(e)
        }
        health_status["status"] = "unhealthy"

    # Check Redis
    try:
        await redis_client.client.ping()
        health_status["dependencies"]["redis"] = {"status": "healthy"}
    except Exception as e:
        health_status["dependencies"]["redis"] = {
            "status": "unhealthy",
            "error": str(e)
        }
        health_status["status"] = "unhealthy"

    status_code = status.HTTP_200_OK if health_status["status"] == "healthy" else status.HTTP_503_SERVICE_UNAVAILABLE

    return health_status


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
```