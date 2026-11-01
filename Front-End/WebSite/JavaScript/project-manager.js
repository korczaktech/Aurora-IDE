(() => {
  "use strict";

  const editor = window.AuroraEditor;
  const sidebar = document.getElementById("fileSidebar");
  const tree = document.getElementById("projectTree");
  const nameLabel = document.getElementById("projectName");
  const status = document.getElementById("projectStatus");
  const selectedLabel = document.getElementById("selectedProjectItem");
  const fileHandles = new Map();
  const directoryHandles = new Map();
  const expanded = new Set([""]);
  const pendingWrites = new Map();
  const writeTimers = new Map();
  const latestContents = new Map();
  let rootHandle = null;
  let selectedPath = "";
  let selectedKind = "directory";
  let currentProjectName = "";

  const ignoredDirectories = new Set([".git"]);
  const textExtensions = new Set([
    "txt","text","html","htm","xhtml","css","scss","sass","less","js","mjs","cjs","jsx","ts","tsx",
    "json","jsonc","json5","md","markdown","mdx","py","pyw","java","kt","kts","swift","go","rs",
    "c","h","cc","cpp","cxx","hpp","hh","cs","php","rb","sql","yml","yaml","sh","bash","zsh",
    "xml","svg","toml","ini","conf","env","gitignore","gitattributes","editorconfig","graphql","gql",
        "vue","svelte","astro","wasm","wat","r","R","lua","pl","ex","exs","erl","hrl","hs","lhs",
    "dart","scala","sc","clj","cljs","cljc","edn","fs","fsx","fsi","vb","vbs","ps1","psm1",
    "bat","cmd","mk","cmake","gradle","properties","dockerfile","lock","csv"
  ]);
  const binaryExtensions = new Set([
    "png","jpg","jpeg","gif","webp","avif","ico","bmp","tif","tiff","mp3","wav","ogg","mp4","mov",
    "avi","webm","pdf","zip","gz","7z","rar","exe","dll","so","dylib","class","jar","bin","woff",
    "woff2","ttf","otf","eot","sqlite","db","psd","ai","sketch"
  ]);

  function setStatus(message, state = "normal") {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  function validSegment(value) {
    return typeof value === "string" && value.length > 0 && value !== "." && value !== ".." &&
      !/[\\/\\0]/.test(value) && !/[<>:"|?*]/.test(value) && !/[. ]$/.test(value);
  }

  function validRelativePath(value) {
    return typeof value === "string" && value.length > 0 && !value.startsWith("/") &&
      !value.includes("\\") && value.split("/").every(validSegment);
  }

  function parentPath(path) {
    const index = path.lastIndexOf("/");
    return index < 0 ? "" : path.slice(0, index);
  }

  function baseName(path) {
    return path.slice(path.lastIndexOf("/") + 1);
  }

  function extension(path) {
    const name = baseName(path).toLowerCase();
    const index = name.lastIndexOf(".");
    return index > 0 ? name.slice(index + 1) : name;
  }

  function isTextPath(path) {
    const ext = extension(path);
    if (binaryExtensions.has(ext)) return false;
    return textExtensions.has(ext) || baseName(path).startsWith(".") ||
      ["Dockerfile", "Makefile", "Justfile", "LICENSE", "README"].includes(baseName(path));
  }

  function showError(error, action) {
    const message = error && error.message ? error.message : String(error || "Erro desconhecido");
    setStatus(action + ": " + message, "error");
    console.error("[Aurora Project Manager]", action, error);
  }

  async function requestDirectoryPicker() {
    if (!window.showDirectoryPicker) {
      throw new Error("Abertura e gravação de pastas exigem Chrome ou Edge atualizado em uma origem HTTPS.");
    }
    return window.showDirectoryPicker({ mode: "readwrite" });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("Armazenamento local não disponível."));
      const request = indexedDB.open("AuroraProjectManager", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("workspace")) db.createObjectStore("workspace");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir o armazenamento local."));
    });
  }

  async function persistRootHandle(handle) {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("workspace", "readwrite");
      tx.objectStore("workspace").put(handle, "lastProject");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Falha ao salvar o projeto recente."));
      tx.onabort = () => reject(tx.error || new Error("Salvamento do projeto recente cancelado."));
    });
    db.close();
  }

  async function restoreRootHandle() {
    const db = await openDatabase();
    const handle = await new Promise((resolve, reject) => {
      const request = db.transaction("workspace", "readonly").objectStore("workspace").get("lastProject");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  }

  async function permissionGranted(handle, request = false) {
    if (!handle) return false;
    const options = { mode: "readwrite" };
    let permission = await handle.queryPermission(options);
    if (permission !== "granted" && request) permission = await handle.requestPermission(options);
    return permission === "granted";
  }

  async function readDirectory(handle, path = "", depth = 0, entries = []) {
    if (depth > 80) throw new Error("A estrutura de pastas excede o limite de profundidade.");
    const children = [];
    for await (const [name, child] of handle.entries()) {
      if (child.kind === "directory" && ignoredDirectories.has(name)) continue;
      const childPath = path ? path + "/" + name : name;
      if (!validRelativePath(childPath)) continue;
      children.push({ name, path: childPath, kind: child.kind, handle: child });
    }
    children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" });
    });
    for (const child of children) {
      entries.push(child);
      if (child.kind === "directory") await readDirectory(child.handle, child.path, depth + 1, entries);
    }
    return entries;
  }

  async function collectTextFiles(entries) {
    const files = {};
    fileHandles.clear();
    directoryHandles.clear();
    directoryHandles.set("", rootHandle);
    for (const entry of entries) {
      if (entry.kind === "directory") {
        directoryHandles.set(entry.path, entry.handle);
        continue;
      }
      fileHandles.set(entry.path, entry.handle);
      if (!isTextPath(entry.path)) continue;
      try {
        const file = await entry.handle.getFile();
        if (file.size > 5 * 1024 * 1024) continue;
        const content = await file.text();
        if (content.includes("\0")) continue;
        files[entry.path] = content;
      } catch (error) {
        console.warn("[Aurora Project Manager] Arquivo ignorado:", entry.path, error);
      }
    }
    return files;
  }

  function makeRow({ name, path, kind, depth }) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "tree-row " + (kind === "directory" ? "tree-folder" : "tree-file");
    row.dataset.projectPath = path;
    row.dataset.projectKind = kind;
    row.style.paddingLeft = (8 + depth * 15) + "px";
    row.setAttribute("aria-label", (kind === "directory" ? "Pasta " : "Arquivo ") + name);
    if (kind === "directory") {
      const chevron = document.createElement("span");
      chevron.className = "tree-chevron";
      chevron.textContent = expanded.has(path) ? "⌄" : "›";
      chevron.setAttribute("aria-hidden", "true");
      const icon = document.createElement("span");
      icon.className = "tree-folder-icon";
      icon.setAttribute("aria-hidden", "true");
      row.append(chevron, icon);
    } else {
      const icon = document.createElement("span");
      icon.className = "tree-file-icon";
      icon.dataset.fileIcon = name;
      icon.innerHTML = window.AuroraFileIcons ? window.AuroraFileIcons.svgForFile(name) : "";
      row.append(icon);
    }
    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = name;
    row.append(label);
    if (path === selectedPath) row.classList.add("is-selected");
    return row;
  }

  function renderEntries(entries) {
    tree.replaceChildren();
    const byParent = new Map();
    for (const entry of entries) {
      const parent = parentPath(entry.path);
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push(entry);
    }

    function appendChildren(parent, depth, container) {
      const children = byParent.get(parent) || [];
      for (const entry of children) {
        const row = makeRow({ ...entry, depth });
        container.append(row);
        if (entry.kind === "directory") {
          const childContainer = document.createElement("div");
          childContainer.className = "tree-children tree-nested";
          childContainer.hidden = !expanded.has(entry.path);
          container.append(childContainer);
          appendChildren(entry.path, depth + 1, childContainer);
        }
      }
    }

    const rootRow = document.createElement("button");
    rootRow.type = "button";
    rootRow.className = "tree-row tree-project";
    rootRow.dataset.projectRoot = "true";
    const chevron = document.createElement("span");
    chevron.className = "tree-chevron";
    chevron.textContent = expanded.has("") ? "⌄" : "›";
    const folder = document.createElement("span");
    folder.className = "tree-folder-icon";
    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = currentProjectName || "Projeto";
    rootRow.append(chevron, folder, label);
    tree.append(rootRow);
    const rootChildren = document.createElement("div");
    rootChildren.className = "tree-children";
    rootChildren.hidden = !expanded.has("");
    tree.append(rootChildren);
    appendChildren("", 0, rootChildren);
  }

  async function commitWrite(path) {
    const content = latestContents.get(path);
    if (content === undefined) return pendingWrites.get(path);
    latestContents.delete(path);
    writeTimers.delete(path);
    const handle = fileHandles.get(path);
    if (!handle) throw new Error("O arquivo não está mais disponível: " + path);
    const previous = pendingWrites.get(path) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    });
    pendingWrites.set(path, write);
    try {
      await write;
      if (pendingWrites.get(path) === write) pendingWrites.delete(path);
      if (!latestContents.has(path)) setStatus("Salvo • " + path, "success");
    } catch (error) {
      if (pendingWrites.get(path) === write) pendingWrites.delete(path);
      showError(error, "Falha ao salvar " + path);
      throw error;
    }
  }

  async function flushWrites() {
    for (const [path, timer] of writeTimers) {
      clearTimeout(timer);
      await commitWrite(path);
    }
    await Promise.all([...pendingWrites.values()]);
  }

  async function openProject(handle) {
    if (!(await permissionGranted(handle, true))) {
      throw new Error("Permissão de leitura e gravação não concedida para esta pasta.");
    }
    await flushWrites();
    rootHandle = handle;
    currentProjectName = handle.name;
    expanded.clear();
    expanded.add("");
    selectedPath = "";
    selectedKind = "directory";
    setStatus("Lendo estrutura do projeto…");
    const entries = await readDirectory(handle);
    const files = await collectTextFiles(entries);
    const firstFile = Object.keys(files).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))[0] || "";
    editor.replaceProject(files, currentProjectName, firstFile);
    renderEntries(entries);
    nameLabel.textContent = currentProjectName;
    selectedLabel.textContent = "Raiz do projeto";
    await persistRootHandle(handle);
    setStatus(entries.length + " itens • alterações salvas no dispositivo", "success");
  }

  async function createProject() {
    const projectName = window.prompt("Nome do novo projeto:");
    if (projectName === null) return;
    const cleanName = projectName.trim();
    if (!validSegment(cleanName)) {
      window.alert("Nome inválido. Evite barras, caracteres especiais e nomes reservados.");
      return;
    }
    const parent = await requestDirectoryPicker();
    try {
      await parent.getDirectoryHandle(cleanName);
      throw new Error("Já existe uma pasta com esse nome no local escolhido.");
    } catch (error) {
      if (error.name !== "NotFoundError") throw error;
    }
    const handle = await parent.getDirectoryHandle(cleanName, { create: true });
    await openProject(handle);
  }

  async function openProjectFolder() {
    const handle = await requestDirectoryPicker();
    await openProject(handle);
  }

  async function targetDirectory() {
    if (!rootHandle) throw new Error("Crie ou abra um projeto primeiro.");
    if (selectedKind === "directory" && selectedPath) {
      return { handle: directoryHandles.get(selectedPath), path: selectedPath };
    }
    if (selectedKind === "file" && selectedPath) {
      const path = parentPath(selectedPath);
      return { handle: directoryHandles.get(path), path };
    }
    return { handle: rootHandle, path: "" };
  }

  async function createFile() {
    const { handle, path } = await targetDirectory();
    const filename = window.prompt("Nome do arquivo (inclua a extensão):");
    if (filename === null) return;
    const name = filename.trim();
    if (!validSegment(name)) throw new Error("Nome de arquivo inválido.");
    const relative = path ? path + "/" + name : name;
    if (fileHandles.has(relative) || directoryHandles.has(relative)) throw new Error("Já existe um item com esse nome.");
    const fileHandle = await handle.getFileHandle(name, { create: true });
    fileHandles.set(relative, fileHandle);
    editor.addFile(relative, "");
    selectedPath = relative;
    selectedKind = "file";
    await refreshProject();
    editor.openFile(relative);
    setStatus("Arquivo criado: " + relative, "success");
  }

  async function createFolder() {
    const { handle, path } = await targetDirectory();
    const folderName = window.prompt("Nome da nova pasta:");
    if (folderName === null) return;
    const name = folderName.trim();
    if (!validSegment(name)) throw new Error("Nome de pasta inválido.");
    const relative = path ? path + "/" + name : name;
    if (fileHandles.has(relative) || directoryHandles.has(relative)) throw new Error("Já existe um item com esse nome.");
    await handle.getDirectoryHandle(name, { create: true });
    selectedPath = relative;
    selectedKind = "directory";
    expanded.add(path);
    expanded.add(relative);
    await refreshProject();
    setStatus("Pasta criada: " + relative, "success");
  }

  async function copyDirectory(source, destination) {
    for await (const [name, child] of source.entries()) {
      if (child.kind === "directory") {
        const next = await destination.getDirectoryHandle(name, { create: true });
        await copyDirectory(child, next);
      } else {
        const sourceFile = await child.getFile();
        const target = await destination.getFileHandle(name, { create: true });
        const writer = await target.createWritable();
        await writer.write(sourceFile);
        await writer.close();
      }
    }
  }

  async function moveEntry(parent, name, newName, kind) {
    const source = kind === "directory"
      ? await parent.getDirectoryHandle(name)
      : await parent.getFileHandle(name);
    if (typeof source.move === "function") {
      await source.move(newName);
      return;
    }
    if (kind === "directory") {
      const destination = await parent.getDirectoryHandle(newName, { create: true });
      await copyDirectory(source, destination);
      await parent.removeEntry(name, { recursive: true });
    } else {
      const sourceFile = await source.getFile();
      const destination = await parent.getFileHandle(newName, { create: true });
      const writer = await destination.createWritable();
      await writer.write(sourceFile);
      await writer.close();
      await parent.removeEntry(name);
    }
  }

  async function renameSelected() {
    if (!selectedPath) throw new Error("Selecione um arquivo ou pasta para renomear.");
    const oldName = baseName(selectedPath);
    const newName = window.prompt("Novo nome:", oldName);
    if (newName === null || newName.trim() === oldName) return;
    const cleanName = newName.trim();
    if (!validSegment(cleanName)) throw new Error("Nome inválido.");
    const parentPathName = parentPath(selectedPath);
    const parent = directoryHandles.get(parentPathName);
    const newPath = parentPathName ? parentPathName + "/" + cleanName : cleanName;
    if (fileHandles.has(newPath) || directoryHandles.has(newPath)) throw new Error("Já existe um item com esse nome.");
    await flushWrites();
    await moveEntry(parent, oldName, cleanName, selectedKind);
    if (selectedKind === "file" && editor.files[selectedPath] !== undefined) editor.renameFile(selectedPath, newPath);
    selectedPath = newPath;
    await refreshProject();
    setStatus("Renomeado para " + cleanName, "success");
  }

  async function deleteSelected() {
    if (!selectedPath) throw new Error("Selecione um arquivo ou pasta para excluir.");
    const kindLabel = selectedKind === "directory" ? "pasta" : "arquivo";
    if (!window.confirm("Excluir a " + kindLabel + " “" + selectedPath + "”? Esta ação não pode ser desfeita.")) return;
    await flushWrites();
    const parent = directoryHandles.get(parentPath(selectedPath));
    await parent.removeEntry(baseName(selectedPath), { recursive: selectedKind === "directory" });
    if (selectedKind === "file") editor.deleteFile(selectedPath);
    else {
      const prefix = selectedPath + "/";
      for (const name of Object.keys(editor.files)) if (name.startsWith(prefix)) editor.deleteFile(name);
    }
    selectedPath = "";
    selectedKind = "directory";
    await refreshProject();
    setStatus("Item excluído.", "success");
  }

  async function refreshProject() {
    if (!rootHandle) return;
    const entries = await readDirectory(rootHandle);
    const files = await collectTextFiles(entries);
    const active = editor.activeFile && files[editor.activeFile] !== undefined ? editor.activeFile :
      (Object.keys(files).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))[0] || "");
    editor.replaceProject(files, currentProjectName, active);
    renderEntries(entries);
    updateSelectionLabel();
  }

  function updateSelectionLabel() {
    selectedLabel.textContent = selectedPath || "Raiz do projeto";
    tree.querySelectorAll("[data-project-path]").forEach(row => {
      row.classList.toggle("is-selected", row.dataset.projectPath === selectedPath);
    });
  }

  function saveEditorChange(event) {
    const detail = event.detail || {};
    const path = detail.path;
    if (!fileHandles.has(path) || typeof detail.content !== "string") return;
    latestContents.set(path, detail.content);
    const previousTimer = writeTimers.get(path);
    if (previousTimer) clearTimeout(previousTimer);
    writeTimers.set(path, setTimeout(() => {
      commitWrite(path).catch(() => {});
    }, 280));
    setStatus("Alterações pendentes • " + path);
  }

  function bindActions() {
    document.getElementById("createProject").addEventListener("click", () => createProject().catch(error => showError(error, "Criar projeto")));
    document.getElementById("openProject").addEventListener("click", () => openProjectFolder().catch(error => showError(error, "Abrir pasta")));
    document.getElementById("newProjectFile").addEventListener("click", () => createFile().catch(error => showError(error, "Criar arquivo")));
    document.getElementById("newProjectFolder").addEventListener("click", () => createFolder().catch(error => showError(error, "Criar pasta")));
    document.getElementById("renameProjectItem").addEventListener("click", () => renameSelected().catch(error => showError(error, "Renomear")));
    document.getElementById("deleteProjectItem").addEventListener("click", () => deleteSelected().catch(error => showError(error, "Excluir")));
    tree.addEventListener("click", event => {
      const row = event.target.closest("[data-project-root], [data-project-path]");
      if (!row) return;
      if (row.hasAttribute("data-project-root")) {
        if (expanded.has("")) expanded.delete(""); else expanded.add("");
        const children = row.nextElementSibling;
        children.hidden = !expanded.has("");
        row.querySelector(".tree-chevron").textContent = expanded.has("") ? "⌄" : "›";
        selectedPath = "";
        selectedKind = "directory";
        updateSelectionLabel();
        return;
      }
      selectedPath = row.dataset.projectPath;
      selectedKind = row.dataset.projectKind;
      if (selectedKind === "directory") {
        if (expanded.has(selectedPath)) expanded.delete(selectedPath); else expanded.add(selectedPath);
        const children = row.nextElementSibling;
        if (children?.classList.contains("tree-children")) children.hidden = !expanded.has(selectedPath);
        row.querySelector(".tree-chevron").textContent = expanded.has(selectedPath) ? "⌄" : "›";
      } else {
        const file = fileHandles.get(selectedPath);
        if (!editor.files[selectedPath] && file) {
          if (!isTextPath(selectedPath)) {
            setStatus("Este arquivo é binário e não pode ser aberto como texto.", "error");
            updateSelectionLabel();
            return;
          }
        }
        if (editor.files[selectedPath] !== undefined) editor.openFile(selectedPath);
        else setStatus("Arquivo grande ou binário: exibido no explorador, não carregado no editor.", "error");
      }
      updateSelectionLabel();
    });
    window.addEventListener("aurora:editor-change", saveEditorChange);
  }

  async function restoreLastProject() {
    try {
      const handle = await restoreRootHandle();
      if (!handle) return;
      if (await permissionGranted(handle, false)) await openProject(handle);
      else setStatus("Projeto recente: " + handle.name + " • reabra a pasta para conceder acesso.");
    } catch (error) {
      console.warn("[Aurora Project Manager] Não foi possível restaurar o projeto:", error);
    }
  }

  bindActions();
  if (!window.showDirectoryPicker) {
    setStatus("Use Chrome ou Edge atualizado para abrir e editar pastas locais.");
    document.getElementById("openProject").title = "Requer Chrome ou Edge atualizado em HTTPS";
    document.getElementById("createProject").title = "Requer Chrome ou Edge atualizado em HTTPS";
  } else {
    restoreLastProject();
  }

  window.AuroraProjectManager = Object.freeze({
    validRelativePath,
    validSegment,
    get projectName() { return currentProjectName; },
    get rootHandle() { return rootHandle; },
    refresh: refreshProject,
    flush: flushWrites
  });
})();