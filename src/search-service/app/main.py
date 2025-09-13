from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import uvicorn
import logging
import time

from .core.config import settings
from .core.elasticsearch import es_client
from .core.redis import redis_client
from .api.v1 import search
from .services.recommendation_service import recommendation_service

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("Starting Search Service...")

    try:
        # Connect to Elasticsearch
        await es_client.connect()
        await es_client.create_indices()

        # Connect to Redis
        redis_client.connect()

        # Load/train ML models
        await recommendation_service.retrain_models_if_needed()

        logger.info("Search Service started successfully")

    except Exception as e:
        logger.error(f"Failed to start service: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down Search Service...")
    await es_client.close()
    await redis_client.close()
    logger.info("Search Service shut down successfully")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Search service for MapGenie clone with Elasticsearch and ML recommendations",
    lifespan=lifespan
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time

    logger.info(
        f"{request.method} {request.url} - "
        f"Status: {response.status_code} - "
        f"Time: {process_time:.4f}s"
    )

    return response


# Include routers
app.include_router(
    search.router,
    prefix=settings.API_V1_PREFIX,
    tags=["search"]
)
# 
# app.include_router(
#     suggestions.router,
#     prefix=settings.API_V1_PREFIX,
#     tags=["suggestions"]
# )
# 
# app.include_router(
#     trending.router,
#     prefix=settings.API_V1_PREFIX,
#     tags=["trending"]
# )
# 
# app.include_router(
#     index_router.router,
#     prefix=settings.API_V1_PREFIX,
#     tags=["indexing"]
# )


@app.get("/", tags=["health"])
async def root():
    """Health check endpoint"""
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "healthy"
    }


@app.get("/health", tags=["health"])
async def health_check():
    """Detailed health check"""
    health_status = {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "healthy",
        "dependencies": {}
    }

    # Check Elasticsearch
    try:
        es_health = await es_client.client.cluster.health()
        health_status["dependencies"]["elasticsearch"] = {
            "status": "healthy",
            "cluster_status": es_health["status"]
        }
    except Exception as e:
        health_status["dependencies"]["elasticsearch"] = {
            "status": "unhealthy",
            "error": str(e)
        }
        health_status["status"] = "unhealthy"

    # Check Redis
    try:
        await redis_client.client.ping()
        health_status["dependencies"]["redis"] = {"status": "healthy"}
    except Exception as e:
        health_status["dependencies"]["redis"] = {
            "status": "unhealthy",
            "error": str(e)
        }
        health_status["status"] = "unhealthy"

    status_code = status.HTTP_200_OK if health_status["status"] == "healthy" else status.HTTP_503_SERVICE_UNAVAILABLE

    return health_status


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )