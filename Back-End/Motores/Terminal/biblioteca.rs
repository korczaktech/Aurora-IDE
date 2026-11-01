//! Motor único e compartilhado do Terminal Aurora.
//!
//! Este crate concentra a execução de processos, PTY, entrada/saída e sessões.
//! Não há implementações separadas para Web ou Native: todas as plataformas
//! consumidoras utilizam este mesmo motor por meio do backend Aurora API.
//! Núcleo do terminal Aurora: Bash real sobre pseudoterminal (PTY).
mod configuracao;
mod erro;
mod sessao;
pub use configuracao::TerminalConfig;
pub use erro::{TerminalError, TerminalResult};
pub use sessao::{
    TerminalManager, TerminalOutput, TerminalSessionInfo, TerminalSessionOptions,
    TerminalSessionStatus,
};
