use aurora_terminal::{
    TerminalConfig, TerminalManager, TerminalSessionOptions, TerminalSessionStatus,
};
use std::{
    collections::BTreeMap,
    thread,
    time::{Duration, Instant},
};
use uuid::Uuid;

fn workspace() -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("aurora-terminal-it-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&path).expect("criar workspace");
    path
}

fn manager() -> TerminalManager {
    let directory = workspace();
    TerminalManager::new(TerminalConfig {
        default_working_directory: directory,
        max_sessions: 2,
        ..TerminalConfig::default()
    })
    .expect("inicializar motor")
}

fn wait_for_output(manager: &TerminalManager, id: &str, marker: &str) -> String {
    let deadline = Instant::now() + Duration::from_secs(8);
    let mut output = Vec::new();
    while Instant::now() < deadline {
        for chunk in manager.read_output(id, 128).expect("ler saída") {
            output.extend(chunk.bytes);
        }
        let text = String::from_utf8_lossy(&output).into_owned();
        if text.contains(marker) {
            return text;
        }
        thread::sleep(Duration::from_millis(20));
    }
    String::from_utf8_lossy(&output).into_owned()
}

#[test]
fn sessao_usa_diretorio_e_ambiente_independentes() {
    let manager = manager();
    let directory = workspace();
    let mut environment = BTreeMap::new();
    environment.insert("AURORA_IT_VALUE".to_owned(), "isolated".to_owned());
    let session = manager
        .create_session_with_options(TerminalSessionOptions {
            working_directory: Some(directory.clone()),
            environment,
        })
        .expect("criar sessão");
    manager
        .write(
            &session.id,
            b"printf 'AURORA_IT_RESULT=%s|%s\n' \"$AURORA_IT_VALUE\" \"$PWD\"\n",
        )
        .expect("executar");
    let output = wait_for_output(&manager, &session.id, "AURORA_IT_RESULT=");
    assert!(output.contains("AURORA_IT_RESULT=isolated|"));
    assert!(output.contains(directory.to_string_lossy().as_ref()));
    manager.close_session(&session.id).expect("encerrar");
    let _ = std::fs::remove_dir_all(directory);
}

#[test]
fn ctrl_c_interrompe_comando_e_preserva_shell() {
    let manager = manager();
    let session = manager.create_session(None).expect("criar sessão");
    manager.write(&session.id, b"sleep 30\n").expect("iniciar sleep");
    thread::sleep(Duration::from_millis(200));
    manager.write(&session.id, b"\x03").expect("enviar Ctrl+C");
    thread::sleep(Duration::from_millis(200));
    manager
        .write(&session.id, b"printf 'AURORA_IT_AFTER_INTERRUPT\n'\n")
        .expect("executar após interrupção");
    let output = wait_for_output(&manager, &session.id, "AURORA_IT_AFTER_INTERRUPT");
    assert!(output.contains("AURORA_IT_AFTER_INTERRUPT"));
    assert_eq!(
        manager.list_sessions().expect("listar")[0].status,
        TerminalSessionStatus::Running
    );
    manager.close_session(&session.id).expect("encerrar");
}

#[test]
fn ctrl_d_encerra_shell_e_registra_codigo_de_saida() {
    let manager = manager();
    let session = manager.create_session(None).expect("criar sessão");
    manager.write(&session.id, b"\x04").expect("enviar Ctrl+D");
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        let current = manager.list_sessions().expect("listar");
        if current[0].status == TerminalSessionStatus::Exited {
            assert_eq!(current[0].exit_code, Some(0));
            break;
        }
        assert!(Instant::now() < deadline, "Bash não encerrou após EOF");
        thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn historico_e_gravado_com_permissao_restrita() {
    let manager = manager();
    let directory = workspace();
    let session = manager
        .create_session(Some(directory.clone()))
        .expect("criar sessão");
    manager
        .write(&session.id, b"printf 'AURORA_HISTORY_IT'\nexit\n")
        .expect("executar comandos");
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        let current = manager.list_sessions().expect("listar");
        if current[0].status == TerminalSessionStatus::Exited {
            break;
        }
        assert!(Instant::now() < deadline, "Bash não encerrou");
        thread::sleep(Duration::from_millis(20));
    }
    let history = std::fs::read_to_string(directory.join(".aurora_history"))
        .expect("arquivo de histórico");
    assert!(history.contains("AURORA_HISTORY_IT"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(directory.join(".aurora_history"))
            .expect("metadados")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }
    let _ = std::fs::remove_dir_all(directory);
}

#[test]
fn rejeita_sobrescrita_de_variaveis_de_sistema() {
    let manager = manager();
    let mut environment = BTreeMap::new();
    environment.insert("PATH".to_owned(), "/tmp".to_owned());
    assert!(manager
        .create_session_with_options(TerminalSessionOptions {
            working_directory: None,
            environment,
        })
        .is_err());
}


#[test]
fn saida_emitida_durante_desconexao_permanece_disponivel_apos_reconexao() {
    let manager = manager();
    let session = manager.create_session(None).expect("criar sessão");
    manager
        .write(&session.id, b"printf 'AURORA_RECONNECT_BUFFERED\n'\n")
        .expect("escrever saída");
    thread::sleep(Duration::from_millis(100));
    let output = wait_for_output(&manager, &session.id, "AURORA_RECONNECT_BUFFERED");
    assert!(output.contains("AURORA_RECONNECT_BUFFERED"));
    manager.close_session(&session.id).expect("encerrar");
}

