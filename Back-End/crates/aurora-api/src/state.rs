use aurora_storage_mongodb::MongoStorage;

/// Dependências compartilhadas entre os handlers HTTP e WebSocket.
#[derive(Clone)]
pub struct AppState {
    pub database: Option<MongoStorage>,
    pub release_repository: String,
}
