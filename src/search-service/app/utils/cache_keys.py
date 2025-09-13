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