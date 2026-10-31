(() => {
  "use strict";
  const output = document.getElementById("terminal-output");
  const form = document.getElementById("command-form");
  const input = document.getElementById("command-input");
  const history = [];
  let historyIndex = 0;
  let fontSize = 12;
  const startedAt = Date.now();

  const stamp = () => new Date().toLocaleTimeString("pt-BR", { hour12: false });
  const addLine = (text, kind = "muted", command = false) => {
    const line = document.createElement("div");
    line.className = "output-line " + kind;
    const time = document.createElement("span");
    time.className = "timestamp";
    time.textContent = stamp();
    line.append(time, document.createTextNode(text));
    if (command) line.classList.add("command");
    output.append(line);
    output.scrollTop = output.scrollHeight;
  };
  const clear = () => {
    output.replaceChildren();
    addLine("Saída limpa. A sessão da interface continua ativa.", "muted");
  };
  const help = () => {
    addLine("Comandos locais disponíveis:", "success");
    addLine("  ajuda                 Mostra esta lista.");
    addLine("  limpar                Limpa a saída do terminal.");
    addLine("  echo <texto>          Exibe o texto informado.");
    addLine("  versao                Exibe a versão da interface.");
    addLine("  estado                Mostra o estado da conexão com o motor.");
    addLine("  tempo                 Mostra há quanto tempo a interface está aberta.");
    addLine("Comandos de sistema ainda dependem do motor Rust.", "muted");
  };
  const executeLocal = raw => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    history.push(trimmed);
    historyIndex = history.length;
    addLine("aurora:/projeto › " + trimmed, "command", true);
    const [name, ...args] = trimmed.split(/\s+/);
    const argument = args.join(" ");
    switch (name.toLowerCase()) {
      case "ajuda": case "help": help(); break;
      case "limpar": case "clear": clear(); break;
      case "echo": addLine(argument, "success"); break;
      case "versao": case "version": addLine("Aurora Terminal Frontend 0.1.0", "success"); break;
      case "estado": addLine("Interface: ativa | Motor Rust: não conectado | Execução de comandos: indisponível", "muted"); break;
      case "tempo": addLine("Interface ativa há " + Math.floor((Date.now() - startedAt) / 1000) + " segundo(s).", "success"); break;
      default:
        addLine("Comando não executado: o motor Terminal ainda não está conectado. A interface não simula comandos de sistema.", "error");
        addLine("Use 'ajuda' para ver os comandos locais disponíveis.", "muted");
    }
  };
  form.addEventListener("submit", event => {
    event.preventDefault();
    executeLocal(input.value);
    input.value = "";
  });
  input.addEventListener("keydown", event => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (history.length) { historyIndex = Math.max(0, historyIndex - 1); input.value = history[historyIndex] || ""; }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] || "";
    } else if (event.key === "l" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); clear();
    } else if (event.key === "c" && event.ctrlKey) {
      event.preventDefault();
      if (input.value) addLine("^C", "muted");
      input.value = "";
    }
  });
  document.getElementById("clear-terminal").addEventListener("click", clear);
  document.getElementById("new-session").addEventListener("click", () => {
    clear();
    document.getElementById("session-id").textContent = "Sessão local reiniciada";
    addLine("Nova sessão de interface criada. O motor continua desconectado.", "success");
  });
  document.getElementById("add-tab").addEventListener("click", () => {
    addLine("A criação de sessões de execução será habilitada com o protocolo do motor.", "muted");
  });
  document.getElementById("terminal-help").addEventListener("click", () => document.getElementById("help-dialog").showModal());
  document.getElementById("font-down").addEventListener("click", () => { fontSize = Math.max(10, fontSize - 1); output.style.setProperty("--terminal-font", fontSize + "px"); });
  document.getElementById("font-up").addEventListener("click", () => { fontSize = Math.min(18, fontSize + 1); output.style.setProperty("--terminal-font", fontSize + "px"); });
  const updateClock = () => { document.getElementById("clock").textContent = stamp(); };
  updateClock();
  setInterval(updateClock, 1000);
  document.getElementById("session-id").textContent = "LOCAL-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  input.focus();
})();