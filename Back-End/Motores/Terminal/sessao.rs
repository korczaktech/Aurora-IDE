use crate::{TerminalConfig, TerminalError, TerminalResult};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::PathBuf,
    sync::{
        mpsc::{sync_channel, Receiver, SyncSender, TryRecvError},
        Arc, Mutex,
    },
    thread,
};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerminalSessionStatus {
    Running,
    Exited,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TerminalSessionInfo {
    pub id: String,
    pub working_directory: PathBuf,
    pub columns: u16,
    pub rows: u16,
    pub status: TerminalSessionStatus,
    pub exit_code: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TerminalOutput {
    pub session_id: String,
    pub bytes: Vec<u8>,
}

struct TerminalSession {
    info: TerminalSessionInfo,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    output_rx: Receiver<Vec<u8>>,
    status: TerminalSessionStatus,
    exit_code: Option<u32>,
}

impl TerminalSession {
    fn write(&mut self, bytes: &[u8]) -> TerminalResult<()> {
        self.refresh_status()?;
        if self.status != TerminalSessionStatus::Running {
            return Err(TerminalError::SessionClosed(self.info.id.clone()));
        }
        self.writer.write_all(bytes)?;
        self.writer.flush()?;
        Ok(())
    }

    fn resize(&mut self, columns: u16, rows: u16) -> TerminalResult<()> {
        self.refresh_status()?;
        if self.status != TerminalSessionStatus::Running {
            return Err(TerminalError::SessionClosed(self.info.id.clone()));
        }
        if columns == 0 || rows == 0 {
            return Err(TerminalError::InvalidConfiguration(
                "dimensões do PTY inválidas".into(),
            ));
        }
        self.master
            .resize(PtySize {
                rows,
                cols: columns,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| TerminalError::Pty(error.to_string()))?;
        self.info.columns = columns;
        self.info.rows = rows;
        Ok(())
    }

    fn refresh_status(&mut self) -> TerminalResult<()> {
        if self.status == TerminalSessionStatus::Running {
            if let Some(status) = self
                .child
                .try_wait()
                .map_err(|e| TerminalError::Pty(e.to_string()))?
            {
                self.status = TerminalSessionStatus::Exited;
                self.exit_code = Some(status.exit_code());
                self.info.status = self.status;
                self.info.exit_code = self.exit_code;
            }
        }
        Ok(())
    }

    fn drain_output(&self, limit: usize) -> Vec<Vec<u8>> {
        let mut output = Vec::new();
        for _ in 0..limit {
            match self.output_rx.try_recv() {
                Ok(bytes) => output.push(bytes),
                Err(TryRecvError::Empty | TryRecvError::Disconnected) => break,
            }
        }
        output
    }

    fn close(&mut self) {
        if self.status == TerminalSessionStatus::Closed {
            return;
        }
        if self.status == TerminalSessionStatus::Running
            && self.child.try_wait().ok().flatten().is_none()
        {
            let _ = self.child.kill();
        }
        let _ = self.child.wait();
        self.status = TerminalSessionStatus::Closed;
        self.info.status = TerminalSessionStatus::Closed;
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        self.close();
    }
}

/// Gerencia sessões Bash independentes com PTY, entrada, saída e resize.
pub struct TerminalManager {
    config: TerminalConfig,
    sessions: Mutex<HashMap<String, Arc<Mutex<TerminalSession>>>>,
}

impl TerminalManager {
    pub fn new(config: TerminalConfig) -> TerminalResult<Self> {
        config.validate()?;
        Ok(Self {
            config,
            sessions: Mutex::new(HashMap::new()),
        })
    }

    pub fn create_session(
        &self,
        working_directory: Option<PathBuf>,
    ) -> TerminalResult<TerminalSessionInfo> {
        let directory =
            working_directory.unwrap_or_else(|| self.config.default_working_directory.clone());
        if !directory.is_dir() {
            return Err(TerminalError::InvalidWorkingDirectory(
                directory.display().to_string(),
            ));
        }

        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| TerminalError::InternalState)?;
        for session in sessions.values() {
            session
                .lock()
                .map_err(|_| TerminalError::InternalState)?
                .refresh_status()?;
        }
        let running = sessions
            .values()
            .filter(|session| {
                session
                    .lock()
                    .map(|session| session.status == TerminalSessionStatus::Running)
                    .unwrap_or(false)
            })
            .count();
        if running >= self.config.max_sessions {
            return Err(TerminalError::SessionLimitReached);
        }

        let pty = native_pty_system();
        let pair = pty
            .openpty(PtySize {
                rows: self.config.initial_rows,
                cols: self.config.initial_columns,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| TerminalError::Pty(error.to_string()))?;

        let mut command = CommandBuilder::new(self.config.shell_path.to_string_lossy().as_ref());
        command.arg("--noprofile");
        command.arg("--norc");
        command.arg("-i");
        command.env_clear();
        command.cwd(&directory);
        command.env("PATH", "/usr/local/bin:/usr/bin:/bin");
        command.env("HOME", directory.to_string_lossy().as_ref());
        command.env("LANG", "C.UTF-8");
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        for (key, value) in &self.config.environment {
            command.env(key, value);
        }

        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| TerminalError::Pty(error.to_string()))?;
        drop(pair.slave);

        let reader = match pair.master.try_clone_reader() {
            Ok(reader) => reader,
            Err(error) => {
                let mut child = child;
                let _ = child.kill();
                let _ = child.wait();
                return Err(TerminalError::Pty(error.to_string()));
            }
        };
        let writer = match pair.master.take_writer() {
            Ok(writer) => writer,
            Err(error) => {
                let mut child = child;
                let _ = child.kill();
                let _ = child.wait();
                return Err(TerminalError::Pty(error.to_string()));
            }
        };
        let (tx, rx) = sync_channel::<Vec<u8>>(128);
        if let Err(error) = spawn_reader(reader, tx) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(TerminalError::Io(error));
        }

        let info = TerminalSessionInfo {
            id: Uuid::new_v4().to_string(),
            working_directory: directory,
            columns: self.config.initial_columns,
            rows: self.config.initial_rows,
            status: TerminalSessionStatus::Running,
            exit_code: None,
        };
        let session = TerminalSession {
            info: info.clone(),
            master: pair.master,
            writer,
            child,
            output_rx: rx,
            status: TerminalSessionStatus::Running,
            exit_code: None,
        };
        sessions.insert(info.id.clone(), Arc::new(Mutex::new(session)));
        Ok(info)
    }

    pub fn write(&self, id: &str, bytes: &[u8]) -> TerminalResult<()> {
        if bytes.is_empty() {
            return Ok(());
        }
        self.session(id)?
            .lock()
            .map_err(|_| TerminalError::InternalState)?
            .write(bytes)
    }

    pub fn resize(&self, id: &str, columns: u16, rows: u16) -> TerminalResult<()> {
        self.session(id)?
            .lock()
            .map_err(|_| TerminalError::InternalState)?
            .resize(columns, rows)
    }

    pub fn read_output(&self, id: &str, max_chunks: usize) -> TerminalResult<Vec<TerminalOutput>> {
        let session = self.session(id)?;
        let mut guard = session.lock().map_err(|_| TerminalError::InternalState)?;
        guard.refresh_status()?;
        Ok(guard
            .drain_output(max_chunks)
            .into_iter()
            .map(|bytes| TerminalOutput {
                session_id: id.to_owned(),
                bytes,
            })
            .collect())
    }

    pub fn list_sessions(&self) -> TerminalResult<Vec<TerminalSessionInfo>> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| TerminalError::InternalState)?;
        let mut result = Vec::with_capacity(sessions.len());
        for session in sessions.values() {
            let mut session = session.lock().map_err(|_| TerminalError::InternalState)?;
            session.refresh_status()?;
            result.push(session.info.clone());
        }
        result.sort_by(|left, right| left.id.cmp(&right.id));
        Ok(result)
    }

    pub fn close_session(&self, id: &str) -> TerminalResult<()> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| TerminalError::InternalState)?
            .remove(id)
            .ok_or_else(|| TerminalError::SessionNotFound(id.to_owned()))?;
        session
            .lock()
            .map_err(|_| TerminalError::InternalState)?
            .close();
        Ok(())
    }

    pub fn shutdown(&self) -> TerminalResult<()> {
        let sessions = {
            let mut guard = self
                .sessions
                .lock()
                .map_err(|_| TerminalError::InternalState)?;
            std::mem::take(&mut *guard)
        };
        for session in sessions.into_values() {
            if let Ok(mut guard) = session.lock() {
                guard.close();
            }
        }
        Ok(())
    }

    fn session(&self, id: &str) -> TerminalResult<Arc<Mutex<TerminalSession>>> {
        self.sessions
            .lock()
            .map_err(|_| TerminalError::InternalState)?
            .get(id)
            .cloned()
            .ok_or_else(|| TerminalError::SessionNotFound(id.to_owned()))
    }
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        if let Ok(sessions) = self.sessions.get_mut() {
            for session in sessions.values() {
                if let Ok(mut guard) = session.lock() {
                    guard.close();
                }
            }
            sessions.clear();
        }
    }
}

fn spawn_reader(reader: Box<dyn Read + Send>, tx: SyncSender<Vec<u8>>) -> std::io::Result<()> {
    thread::Builder::new()
        .name("aurora-pty-reader".into())
        .spawn(move || {
            let mut reader = reader;
            let mut buffer = [0_u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(count) => {
                        // Backpressure preserves every byte while keeping memory bounded.
                        if tx.send(buffer[..count].to_vec()).is_err() {
                            break;
                        }
                    }
                }
            }
        })
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        thread,
        time::{Duration, Instant},
    };

    fn manager(limit: usize) -> TerminalManager {
        let config = TerminalConfig {
            max_sessions: limit,
            ..TerminalConfig::default()
        };
        TerminalManager::new(config).expect("configuração válida")
    }

    #[test]
    fn abre_redimensiona_lista_e_fecha_pty_real() {
        let manager = manager(2);
        let session = manager.create_session(None).expect("Bash real");
        assert_eq!(manager.list_sessions().expect("lista").len(), 1);
        manager.resize(&session.id, 100, 32).expect("resize");
        manager.close_session(&session.id).expect("fechar");
        assert!(manager.list_sessions().expect("lista vazia").is_empty());
    }

    #[test]
    fn envia_comando_e_recebe_saida_real_do_bash() {
        let manager = manager(1);
        let session = manager.create_session(None).expect("Bash real");
        manager
            .write(&session.id, b"printf 'AURORA_PTY_OK\\n'\n")
            .expect("entrada");
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut output = Vec::new();
        while Instant::now() < deadline {
            for chunk in manager.read_output(&session.id, 32).expect("saída") {
                output.extend(chunk.bytes);
            }
            if String::from_utf8_lossy(&output).contains("AURORA_PTY_OK") {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        assert!(
            String::from_utf8_lossy(&output).contains("AURORA_PTY_OK"),
            "saída: {}",
            String::from_utf8_lossy(&output)
        );
        manager.close_session(&session.id).expect("fechar");
    }

    #[test]
    fn aplica_limite_de_sessoes() {
        let manager = manager(1);
        let first = manager.create_session(None).expect("primeira");
        assert!(matches!(
            manager.create_session(None),
            Err(TerminalError::SessionLimitReached)
        ));
        manager.close_session(&first.id).expect("fechar");
    }

    #[test]
    fn detecta_saida_espontanea_e_libera_vaga() {
        let manager = manager(1);
        let first = manager.create_session(None).expect("primeira sessão");
        manager
            .write(&first.id, b"exit 7\n")
            .expect("encerrar shell");
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut state = TerminalSessionStatus::Running;
        let mut exit_code = None;
        while Instant::now() < deadline {
            let info = manager.list_sessions().expect("listar");
            state = info[0].status;
            exit_code = info[0].exit_code;
            if state == TerminalSessionStatus::Exited {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(state, TerminalSessionStatus::Exited);
        assert_eq!(exit_code, Some(7));
        let second = manager.create_session(None).expect("vaga liberada");
        manager.close_session(&second.id).expect("fechar segunda");
    }

    #[test]
    fn saida_intensa_preserva_todos_os_bytes_sem_crescimento_ilimitado() {
        const EXPECTED_Z_BYTES: usize = 524_288;
        let manager = manager(1);
        let session = manager.create_session(None).expect("Bash real");

        manager
            .write(&session.id, b"stty -echo\n")
            .expect("desativar eco do terminal");
        thread::sleep(Duration::from_millis(50));
        let _ = manager
            .read_output(&session.id, 256)
            .expect("limpar eco inicial");

        manager
            .write(
                &session.id,
                b"yes Z | head -c 1048576; printf '\\n\\101\\125\\122\\117\\122\\101\\137\\106\\114\\117\\117\\104\\137\\104\\117\\116\\105\\n'\n",
            )
            .expect("comando de saída intensa");

        let deadline = Instant::now() + Duration::from_secs(15);
        let mut output = Vec::new();
        while Instant::now() < deadline {
            for chunk in manager.read_output(&session.id, 256).expect("saída") {
                output.extend(chunk.bytes);
            }
            if output
                .windows(b"AURORA_FLOOD_DONE".len())
                .any(|window| window == b"AURORA_FLOOD_DONE")
            {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }

        let z_bytes = output.iter().filter(|byte| **byte == b'Z').count();
        assert_eq!(z_bytes, EXPECTED_Z_BYTES, "nenhum byte pode ser descartado");
        assert!(
            output
                .windows(b"AURORA_FLOOD_DONE".len())
                .any(|window| window == b"AURORA_FLOOD_DONE"),
            "o marcador final precisa chegar depois de toda a saída"
        );
        manager.close_session(&session.id).expect("fechar");
    }
    #[test]
    fn rejeita_diretorio_inexistente() {
        let manager = manager(1);
        assert!(matches!(
            manager.create_session(Some(PathBuf::from("/aurora/diretorio-inexistente"))),
            Err(TerminalError::InvalidWorkingDirectory(_))
        ));
    }
}
