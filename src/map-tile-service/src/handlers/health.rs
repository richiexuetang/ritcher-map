use actix_web::{get, web, HttpResponse, Result};
use crate::database::connection::DatabasePool;
use crate::services::cache_manager::CacheManager;
use serde_json::json;

#[get("/health")]
pub async fn health_check(
    db_pool: web::Data<DatabasePool>,
    cache: web::Data<CacheManager>,
) -> Result<HttpResponse> {
    let mut health_status = json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now(),
        "service": "map-tile-service",
        "version": env!("CARGO_PKG_VERSION")
    });

    // Check database connectivity
    let db_healthy = match sqlx::query("SELECT 1").fetch_one(db_pool.get_ref()).await {
        Ok(_) => true,
        Err(e) => {
            tracing::error!("Database health check failed: {}", e);
            false
        }
    };

    // Check Redis connectivity
    let cache_healthy = match cache.get_cache_stats().await {
        Ok(_) => true,
        Err(e) => {
            tracing::error!("Cache health check failed: {}", e);
            false
        }
    };

    health_status["checks"] = json!({
        "database": {
            "status": if db_healthy { "healthy" } else { "unhealthy" }
        },
        "cache": {
            "status": if cache_healthy { "healthy" } else { "unhealthy" }
        }
    });

    let overall_healthy = db_healthy && cache_healthy;
    health_status["status"] = json!(if overall_healthy { "healthy" } else { "unhealthy" });

    let status_code = if overall_healthy { 200 } else { 503 };

    Ok(HttpResponse::build(actix_web::http::StatusCode::from_u16(status_code).unwrap())
        .json(health_status))
}