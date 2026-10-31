use serde::{Deserialize, Serialize};

/// Papel atribuído à conta e carregado a partir do registro persistido.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UserRole {
    Administrator,
    User,
}
