use aurora_storage_mongodb::MongoStorage;
use aurora_users::UserRole;
use bcrypt::{hash, verify, DEFAULT_COST};
use mongodb::bson::Document;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{error::Error, fmt, time::Duration};

const SESSION_LIFETIME: Duration = Duration::from_secs(60 * 60 * 24 * 30);

#[derive(Debug)]
pub enum AuthError {
    InvalidInput(&'static str),
    InvalidCredentials,
    AccountUnavailable,
    InsufficientPermissions,
    Storage(mongodb::error::Error),
    PasswordHash(bcrypt::BcryptError),
}

impl fmt::Display for AuthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(message) => write!(f, "{message}"),
            Self::InvalidCredentials => write!(f, "E-mail ou senha inválidos"),
            Self::AccountUnavailable => write!(f, "Conta indisponível"),
            Self::InsufficientPermissions => write!(f, "Permissão insuficiente"),
            Self::Storage(_) => write!(f, "Falha ao acessar o serviço de contas"),
            Self::PasswordHash(_) => write!(f, "Falha ao processar credenciais"),
        }
    }
}

impl Error for AuthError {}

impl From<mongodb::error::Error> for AuthError {
    fn from(error: mongodb::error::Error) -> Self {
        Self::Storage(error)
    }
}

impl From<bcrypt::BcryptError> for AuthError {
    fn from(error: bcrypt::BcryptError) -> Self {
        Self::PasswordHash(error)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthenticatedAccount {
    pub id: String,
    pub name: String,
    pub email: String,
    pub role: UserRole,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub token_type: &'static str,
    pub expires_at_ms: i64,
    pub account: AuthenticatedAccount,
}

fn token_digest(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

fn account_from_document(document: &Document) -> Result<AuthenticatedAccount, AuthError> {
    let id = document
        .get_str("id")
        .map_err(|_| AuthError::AccountUnavailable)?;
    let name = document
        .get_str("Nome")
        .map_err(|_| AuthError::AccountUnavailable)?;
    let email = document
        .get_str("Email")
        .map_err(|_| AuthError::AccountUnavailable)?;
    let account = document
        .get_document("Conta")
        .map_err(|_| AuthError::AccountUnavailable)?;
    if account.get_str("Status").ok() != Some("active") {
        return Err(AuthError::AccountUnavailable);
    }
    let role = account
        .get_str("Role")
        .map_err(|_| AuthError::AccountUnavailable)?;
    let role = match role {
        "admin" => UserRole::Admin,
        "user" => UserRole::User,
        _ => return Err(AuthError::AccountUnavailable),
    };
    Ok(AuthenticatedAccount {
        id: id.to_owned(),
        name: name.to_owned(),
        email: email.to_owned(),
        role,
    })
}

fn password_hash(document: &Document) -> Result<&str, AuthError> {
    document
        .get_document("Autenticacao")
        .and_then(|auth| auth.get_str("SenhaHash"))
        .map_err(|_| AuthError::AccountUnavailable)
}

pub async fn register(
    storage: &MongoStorage,
    name: &str,
    email: &str,
    phone: Option<&str>,
    password: &str,
) -> Result<AuthResponse, AuthError> {
    let name = name.trim();
    let email = email.trim().to_ascii_lowercase();

    if name.len() < 2 || name.len() > 120 {
        return Err(AuthError::InvalidInput(
            "Nome deve ter entre 2 e 120 caracteres",
        ));
    }
    if email.len() > 254 || !email.contains('@') || email.starts_with('@') || email.ends_with('@') {
        return Err(AuthError::InvalidInput("E-mail inválido"));
    }
    if password.len() < 8 || password.len() > 72 {
        return Err(AuthError::InvalidInput(
            "A senha deve ter entre 8 e 72 bytes",
        ));
    }
    if let Some(phone) = phone {
        if phone.len() > 32 {
            return Err(AuthError::InvalidInput("Telefone inválido"));
        }
    }

    if storage.find_account_by_email(&email).await?.is_some() {
        return Err(AuthError::InvalidInput(
            "Já existe uma conta com este e-mail",
        ));
    }

    let hashed_password = hash(password, DEFAULT_COST)?;
    let account_id = storage
        .create_account(name, &email, phone, &hashed_password)
        .await?;

    create_response(storage, account_id).await
}

pub async fn login(
    storage: &MongoStorage,
    email: &str,
    password: &str,
) -> Result<AuthResponse, AuthError> {
    let email = email.trim().to_ascii_lowercase();
    let document = storage
        .find_account_by_email(&email)
        .await?
        .ok_or(AuthError::InvalidCredentials)?;

    let stored_hash = password_hash(&document)?;
    if !verify(password, stored_hash)? {
        return Err(AuthError::InvalidCredentials);
    }

    let account = account_from_document(&document)?;
    storage.update_last_login(&account.id).await?;
    create_response(storage, account.id).await
}

async fn create_response(
    storage: &MongoStorage,
    account_id: String,
) -> Result<AuthResponse, AuthError> {
    let token = uuid::Uuid::new_v4().to_string() + &uuid::Uuid::new_v4().to_string();
    let digest = token_digest(&token);
    let expires_at_ms = storage
        .create_session(&account_id, &digest, SESSION_LIFETIME)
        .await?;
    let document = storage
        .find_account_by_id(&account_id)
        .await?
        .ok_or(AuthError::AccountUnavailable)?;
    let account = account_from_document(&document)?;

    Ok(AuthResponse {
        access_token: token,
        token_type: "Bearer",
        expires_at_ms,
        account,
    })
}

pub async fn authenticate(
    storage: &MongoStorage,
    token: &str,
) -> Result<AuthenticatedAccount, AuthError> {
    if token.is_empty() || token.len() > 256 {
        return Err(AuthError::InvalidCredentials);
    }
    let digest = token_digest(token);
    let account_id = storage
        .find_active_session(&digest)
        .await?
        .ok_or(AuthError::InvalidCredentials)?;
    storage.touch_session(&digest).await?;
    let document = storage
        .find_account_by_id(&account_id)
        .await?
        .ok_or(AuthError::AccountUnavailable)?;
    account_from_document(&document)
}

pub async fn logout(storage: &MongoStorage, token: &str) -> Result<(), AuthError> {
    if token.is_empty() || token.len() > 256 {
        return Err(AuthError::InvalidCredentials);
    }
    storage.revoke_session(&token_digest(token)).await?;
    Ok(())
}


/// Bloqueia operações administrativas para contas comuns.
pub fn require_admin(account: &AuthenticatedAccount) -> Result<(), AuthError> {
    if account.role == UserRole::Admin {
        Ok(())
    } else {
        Err(AuthError::InsufficientPermissions)
    }
}
