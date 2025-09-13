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