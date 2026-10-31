use std::env;

/// Configuração carregada exclusivamente do ambiente de execução.
pub struct AppConfig {
    pub port: u16,
    pub mongodb_uri: Option<String>,
    pub mongodb_database: String,
    pub cors_allowed_origins: Vec<String>,
}

impl AppConfig {
    pub fn from_env() -> Result<Self, String> {
        let port = env::var("PORT")
            .unwrap_or_else(|_| "10000".to_owned())
            .parse::<u16>()
            .map_err(|_| "PORT precisa ser uma porta TCP válida".to_owned())?;

        let mongodb_uri = env::var("MONGODB_URI")
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());

        let mongodb_database = env::var("MONGODB_DATABASE").unwrap_or_else(|_| "Aurora".to_owned());

        let cors_allowed_origins = env::var("CORS_ALLOWED_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(str::to_owned)
            .collect();

        Ok(Self {
            port,
            mongodb_uri,
            mongodb_database,
            cors_allowed_origins,
        })
    }
}
