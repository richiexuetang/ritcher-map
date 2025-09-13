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