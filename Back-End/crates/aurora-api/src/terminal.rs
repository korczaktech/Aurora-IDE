use crate::state::AppState;
use aurora_terminal::{
    TerminalConfig, TerminalManager, TerminalSessionInfo, TerminalSessionStatus,
};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::Response,
    routing::{delete, get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};
use uuid::Uuid;

const MAX_PER_ACCOUNT: usize = 4;
const MAX_INPUT: usize = 65_536;
const TICKET_TTL: Duration = Duration::from_secs(30);
const MAX_PENDING_TICKETS: usize = 512;

struct Ticket {
    account: String,
    session: String,
    expires: Instant,
}

pub struct TerminalRuntime {
    pub manager: TerminalManager,
    owners: Mutex<HashMap<String, String>>,
    tickets: Mutex<HashMap<String, Ticket>>,
    origins: Vec<String>,
    workspace_root: PathBuf,
}

impl TerminalRuntime {
    pub fn new(origins: Vec<String>) -> Result<Self, aurora_terminal::TerminalError> {
        let workspace_root = std::env::var_os("AURORA_TERMINAL_WORKDIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/tmp/aurora-workspaces"));
        std::fs::create_dir_all(&workspace_root)?;

        let config = TerminalConfig {
            default_working_directory: workspace_root.clone(),
            max_sessions: 8,
            ..TerminalConfig::default()
        };

        Ok(Self {
            manager: TerminalManager::new(config)?,
            owners: Mutex::new(HashMap::new()),
            tickets: Mutex::new(HashMap::new()),
            origins,
            workspace_root,
        })
    }

    fn account_workspace(&self, account_id: &str) -> Result<PathBuf, std::io::Error> {
        if account_id.is_empty()
            || !account_id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "identificador de conta inválido para diretório de trabalho",
            ));
        }

        let path = self.workspace_root.join(account_id);
        std::fs::create_dir_all(&path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))?;
        }
        Ok(path)
    }

    fn owns(&self, account: &str, session: &str) -> bool {
        self.owners
            .lock()
            .map(|owners| owners.get(session).is_some_and(|owner| owner == account))
            .unwrap_or(false)
    }

    fn ticket(&self, account: &str, session: &str) -> Result<String, StatusCode> {
        if !self.owns(account, session) {
            return Err(StatusCode::NOT_FOUND);
        }

        let mut tickets = self
            .tickets
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        tickets.retain(|_, ticket| ticket.expires > Instant::now());
        if tickets.len() >= MAX_PENDING_TICKETS {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }

        let value = Uuid::new_v4().to_string();
        tickets.insert(
            value.clone(),
            Ticket {
                account: account.to_owned(),
                session: session.to_owned(),
                expires: Instant::now() + TICKET_TTL,
            },
        );
        Ok(value)
    }

    fn consume(&self, value: &str) -> Option<Ticket> {
        let ticket = self.tickets.lock().ok()?.remove(value)?;
        (ticket.expires > Instant::now()).then_some(ticket)
    }

    fn origin_ok(&self, headers: &HeaderMap) -> bool {
        headers
            .get(header::ORIGIN)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|origin| self.origins.iter().any(|allowed| allowed == origin))
    }

    pub fn close_account_sessions(&self, account_id: &str) {
        let ids: Vec<String> = self
            .owners
            .lock()
            .map(|owners| {
                owners
                    .iter()
                    .filter(|(_, owner)| owner.as_str() == account_id)
                    .map(|(id, _)| id.clone())
                    .collect()
            })
            .unwrap_or_default();

        for id in &ids {
            let _ = self.manager.close_session(id);
        }
        if let Ok(mut owners) = self.owners.lock() {
            for id in &ids {
                owners.remove(id);
            }
        }
        if let Ok(mut tickets) = self.tickets.lock() {
            tickets.retain(|_, ticket| ticket.account != account_id);
        }
    }
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}

async fn admin_account(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<aurora_auth::AuthenticatedAccount, (StatusCode, Json<Value>)> {
    let database = state.database.as_ref().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error":"Serviço de contas indisponível"})),
        )
    })?;
    let token = bearer_token(headers).ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error":"Autenticação necessária"})),
        )
    })?;
    let account = aurora_auth::authenticate(database, token)
        .await
        .map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error":"Sessão inválida"})),
            )
        })?;
    aurora_auth::require_admin(&account).map_err(|_| {
        (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"Acesso administrativo necessário"})),
        )
    })?;
    Ok(account)
}

fn session_json(session: TerminalSessionInfo) -> Value {
    let status = match session.status {
        TerminalSessionStatus::Running => "running",
        TerminalSessionStatus::Exited => "exited",
        TerminalSessionStatus::Closed => "closed",
    };
    json!({
        "id": session.id,
        "name": "bash",
        "working_directory": session.working_directory,
        "columns": session.columns,
        "rows": session.rows,
        "status": status,
        "exit_code": session.exit_code
    })
}

async fn list_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let account = admin_account(&state, &headers).await?;
    let owners = state.terminal.owners.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":"Estado indisponível"})),
        )
    })?;
    let sessions = state.terminal.manager.list_sessions().map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":error.to_string()})),
        )
    })?;
    let sessions: Vec<Value> = sessions
        .into_iter()
        .filter(|session| {
            owners
                .get(&session.id)
                .is_some_and(|owner| owner == &account.id)
        })
        .map(session_json)
        .collect();

    Ok(Json(json!({"sessions":sessions})))
}

async fn create_session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let account = admin_account(&state, &headers).await?;
    let mut owners = state.terminal.owners.lock().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":"Estado indisponível"})),
        )
    })?;

    let active_sessions = state.terminal.manager.list_sessions().map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":error.to_string()})),
        )
    })?;
    let count = active_sessions
        .iter()
        .filter(|session| {
            session.status == TerminalSessionStatus::Running
                && owners
                    .get(&session.id)
                    .is_some_and(|owner| owner == &account.id)
        })
        .count();
    if count >= MAX_PER_ACCOUNT {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error":"Limite de quatro sessões simultâneas"})),
        ));
    }

    let directory = state
        .terminal
        .account_workspace(&account.id)
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error":error.to_string()})),
            )
        })?;
    let session = state
        .terminal
        .manager
        .create_session(Some(directory))
        .map_err(|error| {
            let status = if matches!(&error, aurora_terminal::TerminalError::SessionLimitReached) {
                StatusCode::TOO_MANY_REQUESTS
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (status, Json(json!({"error":error.to_string()})))
        })?;

    owners.insert(session.id.clone(), account.id);
    Ok((
        StatusCode::CREATED,
        Json(json!({"session":session_json(session)})),
    ))
}

async fn close_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let account = admin_account(&state, &headers).await?;
    if !state.terminal.owns(&account.id, &id) {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error":"Sessão não encontrada"})),
        ));
    }

    state.terminal.manager.close_session(&id).map_err(|error| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error":error.to_string()})),
        )
    })?;
    state
        .terminal
        .owners
        .lock()
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error":"Estado indisponível"})),
            )
        })?
        .remove(&id);
    Ok(StatusCode::NO_CONTENT)
}

async fn create_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let account = admin_account(&state, &headers).await?;
    let value = state.terminal.ticket(&account.id, &id).map_err(|_| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error":"Sessão não encontrada"})),
        )
    })?;
    Ok(Json(json!({"ticket":value,"expires_in_seconds":30})))
}

fn protocol_ticket(headers: &HeaderMap) -> Option<String> {
    headers
        .get("sec-websocket-protocol")?
        .to_str()
        .ok()?
        .split(',')
        .map(str::trim)
        .find_map(|value| value.strip_prefix("aurora-ticket.").map(str::to_owned))
}

async fn websocket(
    State(state): State<AppState>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, StatusCode> {
    if !state.terminal.origin_ok(&headers) {
        return Err(StatusCode::FORBIDDEN);
    }
    let value = protocol_ticket(&headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let grant = state
        .terminal
        .consume(&value)
        .ok_or(StatusCode::UNAUTHORIZED)?;
    if !state.terminal.owns(&grant.account, &grant.session) {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(ws
        .max_message_size(MAX_INPUT)
        .max_frame_size(MAX_INPUT)
        .protocols(["aurora-terminal"])
        .on_upgrade(move |socket| serve(socket, state, grant.session)))
}

async fn send_json(socket: &mut WebSocket, value: Value) -> bool {
    socket
        .send(Message::Text(value.to_string().into()))
        .await
        .is_ok()
}

async fn serve(mut socket: WebSocket, state: AppState, id: String) {
    if !send_json(&mut socket, json!({"type":"ready","session_id":id})).await {
        return;
    }

    let mut tick = tokio::time::interval(Duration::from_millis(25));
    loop {
        tokio::select! {
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if text.len() > MAX_INPUT {
                            break;
                        }
                        let Ok(message) = serde_json::from_str::<Value>(&text) else {
                            continue;
                        };
                        match message["type"].as_str() {
                            Some("input") => {
                                if let Some(data) = message["data"].as_str() {
                                    if data.len() > MAX_INPUT {
                                        break;
                                    }
                                    if let Err(error) = state.terminal.manager.write(&id, data.as_bytes()) {
                                        if !send_json(&mut socket, json!({"type":"error","message":error.to_string()})).await {
                                            break;
                                        }
                                    }
                                }
                            }
                            Some("resize") => {
                                let columns = message["columns"]
                                    .as_u64()
                                    .and_then(|value| u16::try_from(value).ok());
                                let rows = message["rows"]
                                    .as_u64()
                                    .and_then(|value| u16::try_from(value).ok());
                                if let (Some(columns), Some(rows)) = (columns, rows) {
                                    if (20..=300).contains(&columns) && (5..=120).contains(&rows) {
                                        if let Err(error) = state.terminal.manager.resize(&id, columns, rows) {
                                            if !send_json(&mut socket, json!({"type":"error","message":error.to_string()})).await {
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            Some("ping")
                                if !send_json(&mut socket, json!({"type":"pong"})).await =>
                            {
                                break;
                            }
                            Some("ping") => {}
                            _ => {}
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        if socket.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                    _ => {}
                }
            }
            _ = tick.tick() => {
                match state.terminal.manager.read_output(&id, 64) {
                    Ok(chunks) => {
                        for chunk in chunks {
                            let data = String::from_utf8_lossy(&chunk.bytes);
                            if !send_json(&mut socket, json!({"type":"output","data":data})).await {
                                return;
                            }
                        }
                    }
                    Err(error) => {
                        let _ = send_json(&mut socket, json!({"type":"error","message":error.to_string()})).await;
                        break;
                    }
                }
                if let Ok(sessions) = state.terminal.manager.list_sessions() {
                    if let Some(session) = sessions.into_iter().find(|session| session.id == id) {
                        if session.status != TerminalSessionStatus::Running {
                            let _ = send_json(&mut socket, json!({"type":"exit","status":"exited","exit_code":session.exit_code})).await;
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }
        }
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route(
            "/terminal/sessions",
            get(list_sessions).post(create_session),
        )
        .route("/terminal/sessions/{id}", delete(close_session))
        .route("/terminal/sessions/{id}/ticket", post(create_ticket))
        .route("/terminal/ws", get(websocket))
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ticket_tem_uso_unico_e_expira() {
        let runtime = TerminalRuntime::new(vec![]).unwrap();
        let key = Uuid::new_v4().to_string();
        runtime.tickets.lock().unwrap().insert(
            key.clone(),
            Ticket {
                account: "a".into(),
                session: "s".into(),
                expires: Instant::now() + Duration::from_secs(1),
            },
        );
        assert!(runtime.consume(&key).is_some());
        assert!(runtime.consume(&key).is_none());
    }

    #[test]
    fn logout_fecha_sessoes_e_invalida_tickets_da_conta() {
        let runtime = TerminalRuntime::new(vec![]).unwrap();
        let directory = runtime.account_workspace("account-a").unwrap();
        let session = runtime.manager.create_session(Some(directory)).unwrap();
        runtime
            .owners
            .lock()
            .unwrap()
            .insert(session.id.clone(), "account-a".to_owned());
        runtime.tickets.lock().unwrap().insert(
            "one-time-ticket".to_owned(),
            Ticket {
                account: "account-a".to_owned(),
                session: session.id.clone(),
                expires: Instant::now() + Duration::from_secs(30),
            },
        );

        runtime.close_account_sessions("account-a");

        assert!(!runtime.owns("account-a", &session.id));
        assert!(runtime.consume("one-time-ticket").is_none());
    }
}
