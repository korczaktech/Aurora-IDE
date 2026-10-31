use mongodb::{
    bson::{doc, oid::ObjectId, DateTime, Document},
    options::IndexOptions,
    Client, Collection, IndexModel,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Acesso isolado ao banco central de contas da Korczak Technologies.
#[derive(Clone)]
pub struct MongoStorage {
    client: Client,
    accounts_database: String,
    sessions_database: String,
}

impl MongoStorage {
    /// Conecta ao MongoDB e valida a conexão com um ping.
    pub async fn connect(uri: &str, accounts_database: impl Into<String>, sessions_database: impl Into<String>) -> mongodb::error::Result<Self> {
        let client = Client::with_uri_str(uri).await?;
        let storage = Self {
            client,
            accounts_database: accounts_database.into(),
            sessions_database: sessions_database.into(),
        };
        storage.ping().await?;
        Ok(storage)
    }

    fn collection(&self, name: &str) -> Collection<Document> {
        self.client.database(&self.accounts_database).collection(name)
    }

    fn sessions_collection(&self) -> Collection<Document> {
        self.client.database(&self.sessions_database).collection("sessoes")
    }

    pub async fn ping(&self) -> mongodb::error::Result<()> {
        self.client
            .database(&self.accounts_database)
            .run_command(doc! { "ping": 1 })
            .await?;
        self.client
            .database(&self.sessions_database)
            .run_command(doc! { "ping": 1 })
            .await?;
        Ok(())
    }

    /// Cria os índices de sessão. A coleção de contas existente não é alterada.
    pub async fn ensure_auth_indexes(&self) -> mongodb::error::Result<()> {
        let sessions = self.sessions_collection();

        let token_options = IndexOptions::builder()
            .name("unique_session_token_hash".to_owned())
            .unique(true)
            .build();
        sessions
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "tokenHash": 1 })
                    .options(token_options)
                    .build(),
            )
            .await?;

        let expiry_options = IndexOptions::builder()
            .name("session_expiry_ttl".to_owned())
            .expire_after(Duration::ZERO)
            .build();
        sessions
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "expiresAt": 1 })
                    .options(expiry_options)
                    .build(),
            )
            .await?;

        sessions
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "accountId": 1 })
                    .options(
                        IndexOptions::builder()
                            .name("sessions_by_account".to_owned())
                            .build(),
                    )
                    .build(),
            )
            .await?;
        Ok(())
    }

    /// Insere a conta no modelo central já utilizado pelos produtos Korczak.
    pub async fn create_account(
        &self,
        name: &str,
        email: &str,
        phone: Option<&str>,
        password_hash: &str,
    ) -> mongodb::error::Result<String> {
        let account_id = uuid::Uuid::new_v4().to_string();
        let now = DateTime::now();
        let phone_value = phone.map_or(mongodb::bson::Bson::Null, |value| {
            mongodb::bson::Bson::String(value.to_owned())
        });

        let account = doc! {
            "id": &account_id,
            "Nome": name,
            "Email": email,
            "Telefone": phone_value,
            "Planos": {
                "KOS": {
                    "Free": true, "Hephaestus": false, "Apollo": false,
                    "Athena": false, "Zeus": false, "Veles": false, "Marzanna": false
                },
                "Workspace": {
                    "Free": true, "Apollo": false, "Zeus": false, "Veles": false,
                    "Marzanna": false, "Dimitri": false, "Hermes": false,
                    "Morok": false, "Zagryd": false
                }
            },
            "Verified": false,
            "EmailVerified": false,
            "PhoneVerified": false,
            "Conta": {
                "Status": "active",
                "Role": "user",
                "CriadaEm": now,
                "AtualizadaEm": now,
                "UltimoLogin": mongodb::bson::Bson::Null
            },
            "Produtos": { "KOS": true, "Workspace": true, "Site": true },
            "Seguranca": { "TwoFactorEnabled": false, "RecoveryEnabled": true },
            "Preferencias": { "Idioma": "pt-BR", "Tema": "dark" },
            "Metadados": {
                "OrigemCadastro": "Aurora-IDE",
                "VersaoCadastro": "0.1.0",
                "UltimoDispositivo": "",
                "UltimoIP": mongodb::bson::Bson::Null,
                "IdentificadorOrigem": &account_id
            },
            "Autenticacao": {
                "Email": email,
                "SenhaHash": password_hash,
                "EmailVerificado": false
            },
            "PasswordChangedAt": now
        };

        self.collection("contas").insert_one(account).await?;
        Ok(account_id)
    }

    pub async fn find_account_by_email(
        &self,
        email: &str,
    ) -> mongodb::error::Result<Option<Document>> {
        self.collection("contas")
            .find_one(doc! { "Email": email })
            .await
    }

    pub async fn find_account_by_id(
        &self,
        account_id: &str,
    ) -> mongodb::error::Result<Option<Document>> {
        self.collection("contas")
            .find_one(doc! { "id": account_id })
            .await
    }

    pub async fn update_last_login(&self, account_id: &str) -> mongodb::error::Result<()> {
        let now = DateTime::now();
        self.collection("contas")
            .update_one(
                doc! { "id": account_id },
                doc! { "$set": {
                    "Conta.UltimoLogin": now,
                    "Conta.AtualizadaEm": now
                }},
            )
            .await?;
        Ok(())
    }

    /// Guarda somente o hash do token. O token original é entregue uma única vez.
    pub async fn create_session(
        &self,
        account_id: &str,
        token_hash: &str,
        lifetime: Duration,
    ) -> mongodb::error::Result<i64> {
        let now = SystemTime::now();
        let expires = now.checked_add(lifetime).unwrap_or(now);
        let expires_ms = expires
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        self.sessions_collection()
            .insert_one(doc! {
                "_id": ObjectId::new(),
                "sessionId": uuid::Uuid::new_v4().to_string(),
                "accountId": account_id,
                "tokenHash": token_hash,
                "createdAt": DateTime::now(),
                "expiresAt": DateTime::from_millis(expires_ms),
                "revokedAt": mongodb::bson::Bson::Null,
                "lastUsedAt": DateTime::now()
            })
            .await?;
        Ok(expires_ms)
    }

    pub async fn find_active_session(
        &self,
        token_hash: &str,
    ) -> mongodb::error::Result<Option<String>> {
        let session = self.sessions_collection()
            .find_one(doc! {
                "tokenHash": token_hash,
                "revokedAt": mongodb::bson::Bson::Null,
                "expiresAt": { "$gt": DateTime::now() }
            })
            .await?;

        Ok(session.and_then(|document| {
            document.get_str("accountId").ok().map(str::to_owned)
        }))
    }

    pub async fn touch_session(&self, token_hash: &str) -> mongodb::error::Result<()> {
        self.sessions_collection()
            .update_one(
                doc! { "tokenHash": token_hash, "revokedAt": mongodb::bson::Bson::Null },
                doc! { "$set": { "lastUsedAt": DateTime::now() } },
            )
            .await?;
        Ok(())
    }

    pub async fn revoke_session(&self, token_hash: &str) -> mongodb::error::Result<()> {
        self.collection("sessoes")
            .update_one(
                doc! { "tokenHash": token_hash, "revokedAt": mongodb::bson::Bson::Null },
                doc! { "$set": { "revokedAt": DateTime::now() } },
            )
            .await?;
        Ok(())
    }
}
