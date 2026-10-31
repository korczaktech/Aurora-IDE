use std::{collections::BTreeMap, env, path::PathBuf};

#[derive(Debug, Clone)]
pub struct TerminalConfig {
    pub shell_path: PathBuf,
    pub default_working_directory: PathBuf,
    pub max_sessions: usize,
    pub initial_columns: u16,
    pub initial_rows: u16,
    pub environment: BTreeMap<String, String>,
}

impl Default for TerminalConfig {
    fn default() -> Self {
        Self {
            shell_path: PathBuf::from("/bin/bash"),
            default_working_directory: env::current_dir().unwrap_or_else(|_| PathBuf::from("/")),
            max_sessions: 8,
            initial_columns: 120,
            initial_rows: 30,
            environment: BTreeMap::new(),
        }
    }
}

impl TerminalConfig {
    pub fn validate(&self) -> crate::TerminalResult<()> {
        if self.max_sessions == 0 || self.initial_columns == 0 || self.initial_rows == 0 {
            return Err(crate::TerminalError::InvalidConfiguration(
                "limite de sessões e dimensões precisam ser maiores que zero".into(),
            ));
        }
        if !self.default_working_directory.is_dir() {
            return Err(crate::TerminalError::InvalidWorkingDirectory(
                self.default_working_directory.display().to_string(),
            ));
        }
        if !self.shell_path.is_file() {
            return Err(crate::TerminalError::ShellUnavailable(
                self.shell_path.display().to_string(),
            ));
        }
        Ok(())
    }
}
