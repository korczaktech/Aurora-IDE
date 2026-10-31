use aurora_storage_mongodb::MongoStorage;

/// Dependências compartilhadas entre os handlers HTTP.
#[derive(Clone)]
pub struct AppState {
    pub database: Option<MongoStorage>,
}
