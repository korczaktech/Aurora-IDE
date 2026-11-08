use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
struct RegisterRequest {
    name: String,
    email: String,
    password: String,
    phone: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}

fn auth_error(error: aurora_auth::AuthError) -> (StatusCode, Json<Value>) {
    use aurora_auth::AuthError;
    let (status, message) = match error {
        AuthError::InvalidInput(message) => (StatusCode::BAD_REQUEST, message),
        AuthError::InvalidCredentials => (StatusCode::UNAUTHORIZED, "Credenciais inválidas"),
        AuthError::AccountUnavailable => (StatusCode::FORBIDDEN, "Conta indisponível"),
        AuthError::InsufficientPermissions => (StatusCode::FORBIDDEN, "Permissão insuficiente"),
        AuthError::Storage(error) => {
            tracing::error!(error = %error, "Erro no armazenamento de autenticação");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Serviço temporariamente indisponível",
            )
        }
        AuthError::PasswordHash(error) => {
            tracing::error!(error = %error, "Erro ao processar hash de senha");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Não foi possível processar a solicitação",
            )
        }
    };
    (status, Json(json!({ "error": message })))
}

fn database_unavailable() -> (StatusCode, Json<Value>) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({ "error": "Serviço de contas indisponível" })),
    )
}

async fn index() -> Json<Value> {
    Json(json!({
        "service": "Aurora API",
        "status": "online",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

/// Liveness: confirma apenas que o processo HTTP está ativo.
async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "service": "aurora-api" }))
}

/// Readiness: confirma a conexão com o banco central de contas.
async fn readiness(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    match state.database.as_ref() {
        Some(database) => match database.ping().await {
            Ok(()) => (
                StatusCode::OK,
                Json(json!({
                    "status": "ready",
                    "service": "aurora-api",
                    "dependencies": {
                        "accounts": "Contas",
                        "sessions": "Aurora"
                    }
                })),
            ),
            Err(error) => {
                tracing::error!(error = %error, "Verificação do MongoDB falhou");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({ "status": "not_ready" })),
                )
            }
        },
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "status": "not_ready" })),
        ),
    }
}

async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let database = state.database.as_ref().ok_or_else(database_unavailable)?;
    let response = aurora_auth::register(
        database,
        &payload.name,
        &payload.email,
        payload.phone.as_deref(),
        &payload.password,
    )
    .await
    .map_err(auth_error)?;

    Ok((StatusCode::CREATED, Json(json!(response))))
}

async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let database = state.database.as_ref().ok_or_else(database_unavailable)?;
    let response = aurora_auth::login(database, &payload.email, &payload.password)
        .await
        .map_err(auth_error)?;
    Ok(Json(json!(response)))
}

async fn current_account(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let database = state.database.as_ref().ok_or_else(database_unavailable)?;
    let token = bearer_token(&headers)
        .ok_or_else(|| auth_error(aurora_auth::AuthError::InvalidCredentials))?;
    let account = aurora_auth::authenticate(database, token)
        .await
        .map_err(auth_error)?;
    Ok(Json(json!({ "account": account })))
}

async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let database = state.database.as_ref().ok_or_else(database_unavailable)?;
    let token = bearer_token(&headers)
        .ok_or_else(|| auth_error(aurora_auth::AuthError::InvalidCredentials))?;
    let account = aurora_auth::authenticate(database, token)
        .await
        .map_err(auth_error)?;
    aurora_auth::logout(database, token)
        .await
        .map_err(auth_error)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn admin_health(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let database = state.database.as_ref().ok_or_else(database_unavailable)?;
    let token = bearer_token(&headers)
        .ok_or_else(|| auth_error(aurora_auth::AuthError::InvalidCredentials))?;
    let account = aurora_auth::authenticate(database, token)
        .await
        .map_err(auth_error)?;
    aurora_auth::require_admin(&account).map_err(auth_error)?;
    Ok(Json(json!({ "status": "ok", "access": "admin" })))
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/health", get(health))
        .route("/ready", get(readiness))
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/me", get(current_account))
        .route("/auth/logout", post(logout))
        .route("/admin/health", get(admin_health))
        .route("/app/update", get(crate::updates::check_update))
        .with_state(state)
}
