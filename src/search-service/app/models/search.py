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