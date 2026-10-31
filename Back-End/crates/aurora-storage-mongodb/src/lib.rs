use mongodb::{bson::doc, error::Result, Client};

/// Acesso isolado ao banco de dados MongoDB da Aurora.
#[derive(Clone)]
pub struct MongoStorage {
    client: Client,
    database_name: String,
}

impl MongoStorage {
    /// Conecta ao MongoDB e valida a conexão com um ping.
    pub async fn connect(uri: &str, database_name: impl Into<String>) -> Result<Self> {
        let client = Client::with_uri_str(uri).await?;
        let storage = Self {
            client,
            database_name: database_name.into(),
        };

        storage.ping().await?;
        Ok(storage)
    }

    /// Verifica se o banco está respondendo sem expor credenciais ou URI.
    pub async fn ping(&self) -> Result<()> {
        self.client
            .database(&self.database_name)
            .run_command(doc! { "ping": 1 })
            .await?;
        Ok(())
    }
}
