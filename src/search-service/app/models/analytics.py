from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime


class SearchAnalyticsEvent(BaseModel):
    query: str
    normalized_query: str
    user_id: Optional[str] = None
    game_id: Optional[str] = None
    search_type: str
    result_count: int
    filters_applied: Optional[Dict[str, Any]] = None
    timestamp: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    session_id: Optional[str] = None


class ClickAnalyticsEvent(BaseModel):
    query: str
    result_id: str
    result_type: str
    click_position: int
    user_id: Optional[str] = None
    timestamp: datetime
    session_id: Optional[str] = None


class SearchMetrics(BaseModel):
    total_searches: int
    unique_queries: int
    avg_results_per_query: float
    top_queries: List[Dict[str, Any]]
    zero_result_queries: List[Dict[str, Any]]
    click_through_rate: float
    avg_click_position: float
    time_period: str


class QueryPerformance(BaseModel):
    query: str
    search_count: int
    click_count: int
    click_through_rate: float
    avg_click_position: float
    zero_results_count: int
    first_seen: datetime
    last_seen: datetime