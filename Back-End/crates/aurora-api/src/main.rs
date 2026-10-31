mod config;
mod routes;
mod state;
mod terminal;

use axum::http::{header, HeaderValue, Method};
use config::AppConfig;
use state::AppState;
use std::{net::SocketAddr, sync::Arc};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

fn cors_layer(origins: &[String]) -> CorsLayer {
    let allowed: Vec<HeaderValue> = origins.iter().filter_map(|v| HeaderValue::from_str(v).ok()).collect();
    CorsLayer::new().allow_origin(allowed)
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter(
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"))
    ).init();
    let config = AppConfig::from_env().unwrap_or_else(|e| {
        tracing::error!(%e, "Configuração inválida"); std::process::exit(1);
    });
    let database = match config.mongodb_uri.as_deref() {
        Some(uri) => match aurora_storage_mongodb::MongoStorage::connect(
            uri, config.accounts_database.clone(), config.sessions_database.clone()
        ).await {
            Ok(db) => { tracing::info!("MongoDB conectado"); Some(db) }
            Err(e) => { tracing::error!(%e, "Falha MongoDB"); None }
        },
        None => { tracing::warn!("MONGODB_URI não configurada"); None }
    };
    let terminal = Arc::new(terminal::TerminalRuntime::new(config.cors_allowed_origins.clone())
        .unwrap_or_else(|e| { tracing::error!(%e, "Falha ao iniciar terminal"); std::process::exit(1); }));
    let state = AppState { database, terminal };
    let app = routes::router(state.clone()).merge(terminal::router(state))
        .layer(cors_layer(&config.cors_allowed_origins)).layer(TraceLayer::new_for_http());
    let address = SocketAddr::from(([0,0,0,0], config.port));
    let listener = tokio::net::TcpListener::bind(address).await.unwrap_or_else(|e| {
        tracing::error!(%e, %address, "Falha ao abrir porta"); std::process::exit(1);
    });
    tracing::info!(%address, "Aurora API iniciada");
    if let Err(e) = axum::serve(listener, app).await {
        tracing::error!(%e, "Servidor encerrado"); std::process::exit(1);
    }
}