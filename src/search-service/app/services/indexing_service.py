import asyncio
import httpx
from typing import List, Dict, Any
from datetime import datetime
import logging

from ...app.core.elasticsearch import get_elasticsearch
from ...app.core.config import settings
from ...app.core.redis import redis_client
from ...app.utils.text_processing import TextProcessor

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