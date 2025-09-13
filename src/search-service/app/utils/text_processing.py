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
