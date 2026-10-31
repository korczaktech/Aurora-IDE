use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Path, State},
    http::{header, HeaderMap, StatusCode},
    response::Response,
    routing::{delete, get, post},
    Json, Router,
};
use aurora_terminal::{TerminalConfig, TerminalManager, TerminalSessionInfo, TerminalSessionStatus};
use serde_json::{json, Value};
use std::{collections::HashMap, path::PathBuf, sync::Mutex, time::{Duration, Instant}};
use uuid::Uuid;
use crate::state::AppState;

const MAX_PER_ACCOUNT: usize = 4;
const MAX_INPUT: usize = 65_536;
const TICKET_TTL: Duration = Duration::from_secs(30);

struct Ticket { account: String, session: String, expires: Instant }

pub struct TerminalRuntime {
    pub manager: TerminalManager,
    owners: Mutex<HashMap<String, String>>,
    tickets: Mutex<HashMap<String, Ticket>>,
    origins: Vec<String>,
}

impl TerminalRuntime {
    pub fn new(origins: Vec<String>) -> Result<Self, aurora_terminal::TerminalError> {
        let root = std::env::var_os("AURORA_TERMINAL_WORKDIR")
            .map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/tmp/aurora-workspaces"));
        std::fs::create_dir_all(&root)?;
        let config = TerminalConfig { default_working_directory: root, max_sessions: 8, ..TerminalConfig::default() };
        Ok(Self { manager: TerminalManager::new(config)?, owners: Mutex::new(HashMap::new()), tickets: Mutex::new(HashMap::new()), origins })
    }
    fn owns(&self, account: &str, session: &str) -> bool {
        self.owners.lock().map(|m| m.get(session).is_some_and(|v| v == account)).unwrap_or(false)
    }
    fn ticket(&self, account: &str, session: &str) -> Result<String, StatusCode> {
        if !self.owns(account, session) { return Err(StatusCode::NOT_FOUND); }
        let mut map = self.tickets.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        map.retain(|_, v| v.expires > Instant::now());
        let value = Uuid::new_v4().to_string();
        map.insert(value.clone(), Ticket { account: account.into(), session: session.into(), expires: Instant::now() + TICKET_TTL });
        Ok(value)
    }
    fn consume(&self, value: &str) -> Option<Ticket> {
        let ticket = self.tickets.lock().ok()?.remove(value)?;
        (ticket.expires > Instant::now()).then_some(ticket)
    }
    fn origin_ok(&self, headers: &HeaderMap) -> bool {
        headers.get(header::ORIGIN).and_then(|v| v.to_str().ok())
            .is_some_and(|origin| self.origins.iter().any(|allowed| allowed == origin))
    }
}

fn token(headers: &HeaderMap) -> Option<&str> {
    headers.get(header::AUTHORIZATION)?.to_str().ok()?.strip_prefix("Bearer ")
}
async fn admin(state: &AppState, headers: &HeaderMap) -> Result<aurora_auth::AuthenticatedAccount, (StatusCode, Json<Value>)> {
    let db = state.database.as_ref().ok_or_else(|| (StatusCode::SERVICE_UNAVAILABLE, Json(json!({"error":"Serviço de contas indisponível"}))))?;
    let token = token(headers).ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(json!({"error":"Autenticação necessária"}))))?;
    let account = aurora_auth::authenticate(db, token).await.map_err(|_| (StatusCode::UNAUTHORIZED, Json(json!({"error":"Sessão inválida"}))))?;
    aurora_auth::require_admin(&account).map_err(|_| (StatusCode::FORBIDDEN, Json(json!({"error":"Acesso administrativo necessário"}))))?;
    Ok(account)
}
fn session_json(s: TerminalSessionInfo) -> Value {
    let status = match s.status { TerminalSessionStatus::Running => "running", TerminalSessionStatus::Exited => "exited", TerminalSessionStatus::Closed => "closed" };
    json!({"id":s.id,"name":"bash","working_directory":s.working_directory,"columns":s.columns,"rows":s.rows,"status":status,"exit_code":s.exit_code})
}
async fn list(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let account = admin(&state, &headers).await?;
    let owners = state.terminal.owners.lock().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error":"Estado indisponível"}))))?;
    let sessions = state.terminal.manager.list_sessions().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error":e.to_string()}))))?;
    let sessions: Vec<Value> = sessions.into_iter().filter(|s| owners.get(&s.id).is_some_and(|id| id == &account.id)).map(session_json).collect();
    Ok(Json(json!({"sessions":sessions})))
}
async fn create(State(state): State<AppState>, headers: HeaderMap) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let account = admin(&state, &headers).await?;
    let mut owners = state.terminal.owners.lock().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error":"Estado indisponível"}))))?;
    if owners.values().filter(|id| *id == &account.id).count() >= MAX_PER_ACCOUNT {
        return Err((StatusCode::TOO_MANY_REQUESTS, Json(json!({"error":"Limite de quatro sessões simultâneas"}))));
    }
    let session = state.terminal.manager.create_session(None).map_err(|e| {
        let code = if matches!(e, aurora_terminal::TerminalError::SessionLimitReached) { StatusCode::TOO_MANY_REQUESTS } else { StatusCode::INTERNAL_SERVER_ERROR };
        (code, Json(json!({"error":e.to_string()})))
    })?;
    owners.insert(session.id.clone(), account.id);
    Ok((StatusCode::CREATED, Json(json!({"session":session_json(session)}))))
}
async fn close(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    let account = admin(&state, &headers).await?;
    if !state.terminal.owns(&account.id, &id) { return Err((StatusCode::NOT_FOUND, Json(json!({"error":"Sessão não encontrada"})))); }
    state.terminal.manager.close_session(&id).map_err(|e| (StatusCode::NOT_FOUND, Json(json!({"error":e.to_string()}))))?;
    state.terminal.owners.lock().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error":"Estado indisponível"}))))?.remove(&id);
    Ok(StatusCode::NO_CONTENT)
}
async fn ticket(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let account = admin(&state, &headers).await?;
    let value = state.terminal.ticket(&account.id, &id).map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"error":"Sessão não encontrada"}))))?;
    Ok(Json(json!({"ticket":value,"expires_in_seconds":30})))
}
fn protocol_ticket(headers: &HeaderMap) -> Option<String> {
    headers.get("sec-websocket-protocol")?.to_str().ok()?.split(',').map(str::trim)
        .find_map(|v| v.strip_prefix("aurora-ticket.").map(str::to_owned))
}
async fn websocket(State(state): State<AppState>, headers: HeaderMap, ws: WebSocketUpgrade) -> Result<Response, StatusCode> {
    if !state.terminal.origin_ok(&headers) { return Err(StatusCode::FORBIDDEN); }
    let value = protocol_ticket(&headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let grant = state.terminal.consume(&value).ok_or(StatusCode::UNAUTHORIZED)?;
    if !state.terminal.owns(&grant.account, &grant.session) { return Err(StatusCode::NOT_FOUND); }
    Ok(ws.protocols(["aurora-terminal"]).on_upgrade(move |socket| serve(socket, state, grant.session)))
}
async fn send(socket: &mut WebSocket, value: Value) -> bool {
    socket.send(Message::Text(value.to_string().into())).await.is_ok()
}
async fn serve(mut socket: WebSocket, state: AppState, id: String) {
    if !send(&mut socket, json!({"type":"ready","session_id":id})).await { return; }
    let mut tick = tokio::time::interval(Duration::from_millis(25));
    loop {
        tokio::select! {
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    if text.len() > MAX_INPUT { break; }
                    let Ok(message) = serde_json::from_str::<Value>(&text) else { continue };
                    match message["type"].as_str() {
                        Some("input") => if let Some(data) = message["data"].as_str() {
                            if data.len() > MAX_INPUT { break; }
                            if let Err(e) = state.terminal.manager.write(&id, data.as_bytes()) {
                                if !send(&mut socket, json!({"type":"error","message":e.to_string()})).await { break; }
                            }
                        },
                        Some("resize") => {
                            let cols = message["columns"].as_u64().unwrap_or(0) as u16;
                            let rows = message["rows"].as_u64().unwrap_or(0) as u16;
                            if (20..=300).contains(&cols) && (5..=120).contains(&rows) {
                                let _ = state.terminal.manager.resize(&id, cols, rows);
                            }
                        },
                        Some("ping") => if !send(&mut socket, json!({"type":"pong"})).await { break; },
                        _ => {}
                    }
                },
                Some(Ok(Message::Ping(data))) => if socket.send(Message::Pong(data)).await.is_err() { break; },
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                _ => {}
            },
            _ = tick.tick() => {
                match state.terminal.manager.read_output(&id, 64) {
                    Ok(chunks) => for chunk in chunks {
                        if !send(&mut socket, json!({"type":"output","data":String::from_utf8_lossy(&chunk.bytes)})).await { return; }
                    },
                    Err(e) => { let _ = send(&mut socket, json!({"type":"error","message":e.to_string()})).await; break; }
                }
                if let Ok(items) = state.terminal.manager.list_sessions() {
                    if let Some(item) = items.into_iter().find(|s| s.id == id) {
                        if item.status != TerminalSessionStatus::Running {
                            let _ = send(&mut socket, json!({"type":"exit","status":"exited","exit_code":item.exit_code})).await;
                            break;
                        }
                    } else { break; }
                }
            }
        }
    }
}
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/terminal/sessions", get(list).post(create))
        .route("/terminal/sessions/{id}", delete(close))
        .route("/terminal/sessions/{id}/ticket", post(ticket))
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
        runtime.tickets.lock().unwrap().insert(key.clone(), Ticket { account:"a".into(), session:"s".into(), expires:Instant::now()+Duration::from_secs(1) });
        assert!(runtime.consume(&key).is_some());
        assert!(runtime.consume(&key).is_none());
    }
}