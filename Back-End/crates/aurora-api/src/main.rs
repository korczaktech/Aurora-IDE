use axum::{http::HeaderValue, routing::get, Json, Router};
use serde_json::{json, Value};
use std::{env, net::SocketAddr};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "service": "aurora-api" }))
}

async fn index() -> Json<Value> {
    Json(json!({ "service": "Aurora API", "status": "online" }))
}

fn cors_layer() -> CorsLayer {
    let origins = env::var("CORS_ALLOWED_ORIGINS").unwrap_or_default();
    let allowed_origins: Vec<HeaderValue> = origins
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .filter_map(|origin| origin.parse::<HeaderValue>().ok())
        .collect();

    CorsLayer::new().allow_origin(allowed_origins)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let app = Router::new()
        .route("/", get(index))
        .route("/health", get(health))
        .layer(cors_layer())
        .layer(TraceLayer::new_for_http());

    let port = env::var("PORT")
        .unwrap_or_else(|_| "10000".to_owned())
        .parse::<u16>()
        .expect("PORT precisa ser uma porta TCP válida");
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .expect("Não foi possível abrir a porta HTTP");

    tracing::info!(%address, "Aurora API iniciada");
    axum::serve(listener, app)
        .await
        .expect("O servidor HTTP foi encerrado com erro");
}
