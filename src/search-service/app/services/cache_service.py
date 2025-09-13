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