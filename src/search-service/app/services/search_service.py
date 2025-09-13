from typing import List, Dict, Any, Optional
from elasticsearch import AsyncElasticsearch
from ...app.models.search import (
    SearchRequest, SearchResponse, SearchHit,
    SearchType, SortOrder, SearchFilter
)
from ...app.core.elasticsearch import get_elasticsearch
from ...app.core.config import settings
from ...app.utils.text_processing import TextProcessor
from ...app.services.analytics_service import AnalyticsService
from ...app.services.cache_service import CacheService
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