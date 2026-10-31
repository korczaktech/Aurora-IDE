use thiserror::Error;
#[derive(Debug, Error)]
pub enum TerminalError {
    #[error("erro de entrada/saída: {0}")]
    Io(#[from] std::io::Error),
    #[error("erro do PTY: {0}")]
    Pty(String),
    #[error("configuração inválida: {0}")]
    InvalidConfiguration(String),
    #[error("diretório de trabalho inválido: {0}")]
    InvalidWorkingDirectory(String),
    #[error("shell indisponível: {0}")]
    ShellUnavailable(String),
    #[error("limite de sessões simultâneas atingido")]
    SessionLimitReached,
    #[error("sessão não encontrada: {0}")]
    SessionNotFound(String),
    #[error("sessão encerrada: {0}")]
    SessionClosed(String),
    #[error("estado interno do motor indisponível")]
    InternalState,
}
pub type TerminalResult<T> = Result<T, TerminalError>;
