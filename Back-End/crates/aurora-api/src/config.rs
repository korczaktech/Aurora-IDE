use std::env;

/// Configuração carregada exclusivamente do ambiente de execução.
pub struct AppConfig {
    pub port: u16,
    pub mongodb_uri: Option<String>,
    pub accounts_database: String,
    pub sessions_database: String,
    pub cors_allowed_origins: Vec<String>,
    pub release_repository: String,
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

        let accounts_database =
            env::var("MONGODB_ACCOUNTS_DATABASE").unwrap_or_else(|_| "Contas".to_owned());
        let sessions_database =
            env::var("MONGODB_SESSIONS_DATABASE").unwrap_or_else(|_| "Aurora".to_owned());

        let cors_allowed_origins = env::var("CORS_ALLOWED_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(str::to_owned)
            .collect();

        let release_repository = env::var("AURORA_RELEASE_REPOSITORY")
            .unwrap_or_else(|_| "korczaktech/Aurora-IDE".to_owned());
        if release_repository.split('/').count() != 2
            || !release_repository
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '/'))
        {
            return Err("AURORA_RELEASE_REPOSITORY precisa estar no formato proprietário/repositorio".to_owned());
        }

        Ok(Self {
            port,
            mongodb_uri,
            accounts_database,
            sessions_database,
            cors_allowed_origins,
            release_repository,
        })
    }
}
