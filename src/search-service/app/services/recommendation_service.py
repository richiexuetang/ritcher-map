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