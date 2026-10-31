use aurora_storage_mongodb::MongoStorage;
use std::sync::Arc;
use crate::terminal::TerminalRuntime;

#[derive(Clone)]
pub struct AppState {
    pub database: Option<MongoStorage>,
    pub terminal: Arc<TerminalRuntime>,
}