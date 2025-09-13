from fastapi import APIRouter, Depends, Query, HTTPException, Request
from typing import List, Optional
from ...models.search import (
    SearchRequest, SearchResponse, SearchType, SortOrder, SearchFilter
)
from ...services.search_service import search_service
# from ....app.core.security import get_current_user_optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/search", response_model=SearchResponse)
async def search(
        request: Request,
        q: str = Query(..., description="Search query", min_length=1, max_length=1000),
        search_type: SearchType = Query(SearchType.ALL, description="Type of items to search"),
        sort: SortOrder = Query(SortOrder.RELEVANCE, description="Sort order"),
        page: int = Query(1, ge=1, description="Page number"),
        page_size: int = Query(20, ge=1, le=100, description="Results per page"),
        include_suggestions: bool = Query(True, description="Include search suggestions"),
        highlight: bool = Query(True, description="Include result highlighting"),

        # Filter parameters
        game_ids: Optional[List[str]] = Query(None, description="Filter by game IDs"),
        category_ids: Optional[List[str]] = Query(None, description="Filter by category IDs"),
        tags: Optional[List[str]] = Query(None, description="Filter by tags"),
        difficulty: Optional[List[str]] = Query(None, description="Filter by difficulty"),
        completion_type: Optional[List[str]] = Query(None, description="Filter by completion type"),

        # Geographic filters
        north: Optional[float] = Query(None, description="North boundary for geographic search"),
        south: Optional[float] = Query(None, description="South boundary for geographic search"),
        east: Optional[float] = Query(None, description="East boundary for geographic search"),
        west: Optional[float] = Query(None, description="West boundary for geographic search"),

        # current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Search across markers, games, and categories with advanced filtering and sorting.
    """
    try:
        # Build filters
        filters = None
        if any([game_ids, category_ids, tags, difficulty, completion_type, north]):
            filters = SearchFilter(
                game_ids=game_ids,
                category_ids=category_ids,
                tags=tags,
                difficulty=difficulty,
                completion_type=completion_type
            )

            # Add geographic bounds if provided
            if all([north, south, east, west]):
                filters.coordinates_bounds = {
                    "north": north,
                    "south": south,
                    "east": east,
                    "west": west
                }

        # Create search request
        search_request = SearchRequest(
            query=q,
            search_type=search_type,
            filters=filters,
            sort=sort,
            page=page,
            page_size=page_size,
            include_suggestions=include_suggestions,
            highlight=highlight
        )

        # Perform search
        result = await search_service.search(
            request=search_request,
            # user_id=current_user.get("user_id") if current_user else None,
            session_id=request.headers.get("X-Session-ID"),
            ip_address=request.client.host
        )

        return result

    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail="Internal search error")


@router.post("/search/advanced", response_model=SearchResponse)
async def advanced_search(
        request: Request,
        search_request: SearchRequest,
        # current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Advanced search with full SearchRequest body for complex queries.
    """
    try:
        result = await search_service.search(
            request=search_request,
            # user_id=current_user.get("user_id") if current_user else None,
            session_id=request.headers.get("X-Session-ID"),
            ip_address=request.client.host
        )

        return result

    except Exception as e:
        logger.error(f"Advanced search error: {e}")
        raise HTTPException(status_code=500, detail="Internal search error")


@router.post("/search/click")
async def track_click(
        request: Request,
        query: str,
        result_id: str,
        result_type: str,
        click_position: int,
        # current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Track click events for search analytics and recommendations.
    """
    try:
        from ....app.services.analytics_service import analytics_service

        await analytics_service.track_click(
            query=query,
            result_id=result_id,
            result_type=result_type,
            click_position=click_position,
            # user_id=current_user.get("user_id") if current_user else None,
            session_id=request.headers.get("X-Session-ID")
        )

        return {"status": "success"}

    except Exception as e:
        logger.error(f"Click tracking error: {e}")
        raise HTTPException(status_code=500, detail="Internal tracking error")