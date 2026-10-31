mod config;
mod routes;
mod state;

use axum::http::{header, HeaderValue, Method};
use config::AppConfig;
use state::AppState;
use std::net::SocketAddr;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

fn cors_layer(origins: &[String]) -> CorsLayer {
    let allowed_origins: Vec<HeaderValue> = origins
        .iter()
        .filter_map(|origin| HeaderValue::from_str(origin).ok())
        .collect();

    CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = AppConfig::from_env().unwrap_or_else(|error| {
        tracing::error!(%error, "Configuração inválida");
        std::process::exit(1);
    });

    let database = match config.mongodb_uri.as_deref() {
        Some(uri) => match aurora_storage_mongodb::MongoStorage::connect(
            uri,
            config.accounts_database.clone(),
            config.sessions_database.clone(),
        )
        .await
        {
            Ok(storage) => {
                tracing::info!("Conexão com MongoDB estabelecida");
                Some(storage)
            }
            Err(error) => {
                tracing::error!(%error, "Não foi possível conectar ao MongoDB");
                None
            }
        },
        None => {
            tracing::warn!("MONGODB_URI não configurada; API iniciará sem persistência");
            None
        }
    };

    let state = AppState { database };
    let app = routes::router(state)
        .layer(cors_layer(&config.cors_allowed_origins))
        .layer(TraceLayer::new_for_http());

    let address = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .unwrap_or_else(|error| {
            tracing::error!(%error, %address, "Não foi possível abrir a porta HTTP");
            std::process::exit(1);
        });

    tracing::info!(%address, "Aurora API iniciada");
    if let Err(error) = axum::serve(listener, app).await {
        tracing::error!(%error, "Servidor HTTP encerrado com erro");
        std::process::exit(1);
    }
}
