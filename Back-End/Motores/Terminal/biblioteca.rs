//! Núcleo do terminal Aurora: Bash real sobre pseudoterminal (PTY).
mod configuracao;
mod erro;
mod sessao;
pub use configuracao::TerminalConfig;
pub use erro::{TerminalError, TerminalResult};
pub use sessao::{TerminalManager, TerminalOutput, TerminalSessionInfo};
