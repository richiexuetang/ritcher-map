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
