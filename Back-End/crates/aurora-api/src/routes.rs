use axum::{
    extract::State,
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};

use crate::state::AppState;

async fn index() -> Json<Value> {
    Json(json!({
        "service": "Aurora API",
        "status": "online",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

/// Liveness: confirma apenas que o processo HTTP está ativo.
async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "service": "aurora-api" }))
}

/// Readiness: confirma que as dependências necessárias estão disponíveis.
async fn readiness(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    match state.database.as_ref() {
        Some(database) => match database.ping().await {
            Ok(()) => (
                StatusCode::OK,
                Json(json!({
                    "status": "ready",
                    "service": "aurora-api",
                    "dependencies": { "mongodb": "connected" }
                })),
            ),
            Err(error) => {
                tracing::error!(error = %error, "Verificação do MongoDB falhou");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({
                        "status": "not_ready",
                        "service": "aurora-api",
                        "dependencies": { "mongodb": "unavailable" }
                    })),
                )
            }
        },
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "not_ready",
                "service": "aurora-api",
                "dependencies": { "mongodb": "not_configured" }
            })),
        ),
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/health", get(health))
        .route("/ready", get(readiness))
        .with_state(state)
}
