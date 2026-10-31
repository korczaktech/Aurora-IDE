use mongodb::{error::Result, Client};

/// Cria um cliente MongoDB usando uma URI fornecida pelo ambiente.
/// A URI nunca deve ser armazenada no código-fonte.
pub async fn connect(uri: &str) -> Result<Client> {
    Client::with_uri_str(uri).await
}
