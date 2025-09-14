use actix_cors::Cors;
use actix_web::http;

pub fn cors() -> Cors {
    Cors::default()
        .allowed_origin("http://localhost:3000")
        .allowed_origin("https://ritcher.dev")
        .allowed_methods(vec!["GET", "POST", "DELETE"])
        .allowed_headers(vec![
            http::header::AUTHORIZATION,
            http::header::ACCEPT,
            http::header::CONTENT_TYPE,
            http::header::IF_NONE_MATCH,
        ])
        .expose_headers(vec![http::header::ETAG])
        .max_age(3600)
}