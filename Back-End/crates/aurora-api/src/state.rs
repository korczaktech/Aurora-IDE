use crate::terminal::TerminalRuntime;
use aurora_storage_mongodb::MongoStorage;
use std::sync::Arc;

/// Dependências compartilhadas entre os handlers HTTP e WebSocket.
#[derive(Clone)]
pub struct AppState {
    pub database: Option<MongoStorage>,
    pub terminal: Arc<TerminalRuntime>,
}