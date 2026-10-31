(() => {
  "use strict";
  const starterFiles = {
    "index.html": `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meu primeiro projeto</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="welcome">
    <span class="eyebrow">AURORA EDS</span>
    <h1>Olá, mundo<span>.</span></h1>
    <p>Seu próximo projeto começa aqui.</p>
    <button id="helloButton">Clique para começar</button>
  </main>
  <script src="script.js"><\/script>
</body>
</html>`,
    "style.css": `* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #08120f;
  color: #e5f4ed;
  font-family: system-ui, sans-serif;
}
.welcome { text-align: center; padding: 32px; }
.eyebrow { color: #75d9ad; letter-spacing: .2em; font-size: 12px; }
h1 { font-size: clamp(42px, 8vw, 76px); margin: 16px 0; }
h1 span { color: #75d9ad; }
p { color: #9db4a9; }
button {
  margin-top: 18px; padding: 12px 18px; border: 0;
  border-radius: 6px; background: #75d9ad; color: #092016;
  font-weight: 700; cursor: pointer;
}`,
    "script.js": `const button = document.querySelector("#helloButton");

button?.addEventListener("click", () => {
  console.log("Aurora Runtime: JavaScript executado com sucesso!");
  button.textContent = "Está funcionando!";
});`
  };
  const files = { ...starterFiles };
  const editor = document.getElementById("codeEditor");
  const lineNumbers = document.getElementById("lineNumbers");
  const fileList = document.getElementById("fileList");
  const tabs = document.getElementById("editorTabs");
  const preview = document.getElementById("previewFrame");
  const previewEmpty = document.getElementById("previewEmpty");
  const output = document.getElementById("consoleOutput");
  const outputCount = document.getElementById("outputCount");
  const saveState = document.getElementById("saveState");
  const projectKey = "aurora-editor-project-v1";
  let activeFile = "index.html";
  let hasRun = false;
  let messages = [];

  try {
    const saved = JSON.parse(localStorage.getItem(projectKey) || "null");
    if (saved && saved.files && typeof saved.files === "object") {
      Object.entries(saved.files).forEach(([name, content]) => {
        if (typeof content === "string" && /^[\w.-]+$/.test(name)) files[name] = content;
      });
    }
  } catch (error) { console.warn("[Aurora] Não foi possível recuperar o projeto local.", error); }

  const languageFor = name => name.endsWith(".html") ? "HTML" : name.endsWith(".css") ? "CSS" : name.endsWith(".js") ? "JAVASCRIPT" : "TEXTO";
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  const setSaveState = value => { saveState.textContent = value; };
  const renderOutput = () => {
    output.innerHTML = messages.length ? messages.map(item => `<p class="console-line ${item.kind}">${escapeHTML(item.text)}</p>`).join("") : '<p class="console-hint">A saída do JavaScript aparecerá aqui quando você executar o projeto.</p>';
    outputCount.textContent = messages.length + (messages.length === 1 ? " mensagem" : " mensagens");
    output.scrollTop = output.scrollHeight;
  };
  const log = (text, kind = "info") => {
    messages.push({ text: String(text), kind });
    renderOutput();
  };
  const updateLines = () => {
    const count = Math.max(1, editor.value.split("\n").length);
    lineNumbers.textContent = Array.from({ length: count }, (_, index) => index + 1).join("\n");
    lineNumbers.scrollTop = editor.scrollTop;
  };
  const updateCursor = () => {
    const before = editor.value.slice(0, editor.selectionStart);
    const row = before.split("\n");
    document.getElementById("cursorPosition").textContent = `Ln ${row.length}, Col ${row[row.length - 1].length + 1}`;
  };
  const renderFiles = () => {
    fileList.innerHTML = "";
    tabs.innerHTML = "";
    Object.keys(files).forEach(name => {
      const type = name.endsWith(".html") ? "html" : name.endsWith(".css") ? "css" : name.endsWith(".js") ? "js" : "txt";
      const glyph = type === "html" ? "5" : type === "css" ? "▧" : type === "js" ? "JS" : "·";
      const file = document.createElement("button");
      file.type = "button"; file.className = "file-item" + (name === activeFile ? " selected" : "");
      file.dataset.file = name;
      file.innerHTML = `<span class="file-icon ${type}">${glyph}</span>${escapeHTML(name)}`;
      fileList.append(file);
      const tab = document.createElement("button");
      tab.type = "button"; tab.className = "editor-tab" + (name === activeFile ? " active" : "");
      tab.dataset.file = name;
      tab.innerHTML = `<span class="file-icon ${type}">${glyph}</span>${escapeHTML(name)} <i>×</i>`;
      tabs.append(tab);
    });
  };
  const openFile = name => {
    if (!(name in files)) return;
    activeFile = name;
    editor.value = files[name];
    document.getElementById("breadcrumbFile").textContent = name;
    document.getElementById("languageLabel").textContent = languageFor(name);
    document.getElementById("statusLanguage").textContent = languageFor(name);
    renderFiles(); updateLines(); updateCursor(); editor.focus();
  };
  const save = () => {
    files[activeFile] = editor.value;
    try {
      localStorage.setItem(projectKey, JSON.stringify({ files, updatedAt: new Date().toISOString() }));
      setSaveState("Salvo neste dispositivo");
      log("Projeto salvo no armazenamento local.", "info");
    } catch (error) {
      setSaveState("Falha ao salvar");
      log("Não foi possível salvar: armazenamento indisponível ou cheio.", "error");
    }
  };
  const scriptBridge = `<script>
    (() => {
      const send = (kind, args) => parent.postMessage({ source: "aurora-runtime", kind, text: args.map(value => {
        try { return typeof value === "string" ? value : JSON.stringify(value); }
        catch (_) { return String(value); }
      }).join(" ") }, "*");
      ["log","info","warn","error"].forEach(kind => {
        const original = console[kind].bind(console);
        console[kind] = (...args) => { send(kind === "error" ? "error" : kind === "warn" ? "warn" : "info", args); original(...args); };
      });
      window.addEventListener("error", event => send("error", [event.message + " (linha " + event.lineno + ")"]));
      window.addEventListener("unhandledrejection", event => send("error", ["Promise rejeitada:", event.reason]));
    })();
  <\/script>`;
  const run = () => {
    files[activeFile] = editor.value;
    messages = [];
    renderOutput();
    const html = files["index.html"] || "<!doctype html><html><body><h1>Crie um index.html</h1></body></html>";
    const css = files["style.css"] || "";
    const js = (files["script.js"] || "").replace(/<\/script/gi, "<\\/script");
    let documentSource;
    if (activeFile.endsWith(".html")) {
      documentSource = html.replace("</head>", `<style>\n${css}\n</style>\n</head>`).replace("</body>", `${scriptBridge}\n<script>\n${js}\n<\/script>\n</body>`);
    } else {
      documentSource = html.replace("</head>", `<style>\n${css}\n</style>\n</head>`).replace("</body>", `${scriptBridge}\n<script>\n${js}\n<\/script>\n</body>`);
    }
    preview.srcdoc = documentSource;
    previewEmpty.hidden = true;
    document.getElementById("previewStatus").textContent = "Executado no navegador";
    hasRun = true;
    log("Aurora Web Runtime iniciado. HTML, CSS e JavaScript carregados no ambiente isolado.", "info");
    log("Aviso: linguagens nativas como Rust, C e C++ exigirão o motor de compilação do Aurora.", "warn");
    setSaveState("Alterações em edição");
  };
  fileList.addEventListener("click", event => {
    const button = event.target.closest("[data-file]");
    if (button) { files[activeFile] = editor.value; openFile(button.dataset.file); }
  });
  tabs.addEventListener("click", event => {
    const button = event.target.closest("[data-file]");
    if (button) { files[activeFile] = editor.value; openFile(button.dataset.file); }
  });
  editor.addEventListener("input", () => {
    files[activeFile] = editor.value; updateLines(); updateCursor(); setSaveState("Alterações não salvas");
  });
  editor.addEventListener("scroll", () => { lineNumbers.scrollTop = editor.scrollTop; });
  editor.addEventListener("click", updateCursor);
  editor.addEventListener("keyup", updateCursor);
  editor.addEventListener("keydown", event => {
    if (event.key === "Tab") {
      event.preventDefault();
      const start = editor.selectionStart, end = editor.selectionEnd;
      editor.setRangeText("  ", start, end, "end");
      editor.dispatchEvent(new Event("input"));
    }
  });
  document.getElementById("saveButton").addEventListener("click", save);
  document.getElementById("runButton").addEventListener("click", run);
  document.getElementById("refreshPreview").addEventListener("click", run);
  document.getElementById("clearOutput").addEventListener("click", () => { messages = []; renderOutput(); });
  document.getElementById("newFileButton").addEventListener("click", () => {
    const name = prompt("Nome do arquivo. Exemplo: app.js");
    if (!name) return;
    const safeName = name.trim();
    if (!/^[\w.-]+$/.test(safeName) || safeName.startsWith(".") || safeName in files) {
      log("Nome inválido ou arquivo já existente.", "error"); return;
    }
    files[safeName] = ""; openFile(safeName); save();
  });
  window.addEventListener("message", event => {
    if (event.source !== preview.contentWindow || !event.data || event.data.source !== "aurora-runtime") return;
    log(event.data.text, event.data.kind || "info");
  });
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); run(); }
  });
  document.getElementById("projectName").textContent = "Meu primeiro projeto";
  openFile("index.html");
  renderOutput();
  setSaveState("Projeto local pronto");
  if (hasRun) run();
})();