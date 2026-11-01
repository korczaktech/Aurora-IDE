(() => {
"use strict";

const PACKAGE_URL = new URL("runtime/nodebrowser/package/dist/index.js", document.baseURI).href;
const MAX_FILES = 3000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 48 * 1024 * 1024;
let apiPromise = null;

function equalBytes(a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

function safePath(value) {
  const parts = String(value || "").replace(/\\/g, "/").split("/");
  const clean = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === ".." || part.includes("\0")) throw new Error("Caminho fora do projeto recusado.");
    clean.push(part);
  }
  return clean.join("/");
}

function excluded(name) {
  return name === ".git" || name === ".aurora" || name === "node_modules";
}

async function loadApi() {
  if (!apiPromise) {
    apiPromise = import(PACKAGE_URL).then(module => {
      if (!module?.NodeBrowser?.boot) throw new Error("O pacote NodeBrowser não expôs NodeBrowser.boot().");
      return module.NodeBrowser;
    }).catch(error => {
      apiPromise = null;
      throw new Error("Não foi possível carregar o runtime Node WebAssembly: " + (error?.message || String(error)));
    });
  }
  return apiPromise;
}

async function getProjectId(root) {
  const metadata = await root.getDirectoryHandle(".aurora", { create: true });
  const marker = await metadata.getFileHandle("node-runtime-id", { create: true });
  let id = (await (await marker.getFile()).text()).trim();
  if (!/^[a-f0-9-]{20,64}$/i.test(id)) {
    id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
    const writer = await marker.createWritable();
    await writer.write(id);
    await writer.close();
  }
  return id.replace(/[^a-f0-9]/gi, "").toLowerCase();
}

async function scanProject(root) {
  const files = new Map();
  const directories = new Set([""]);
  let totalBytes = 0;
  async function walk(directory, prefix, depth) {
    if (depth > 18) throw new Error("Projeto excede o limite de profundidade de 18 diretórios.");
    for await (const [name, handle] of directory.entries()) {
      if (excluded(name)) continue;
      const relative = safePath(prefix ? prefix + "/" + name : name);
      if (!relative) continue;
      if (handle.kind === "directory") {
        directories.add(relative);
        await walk(handle, relative, depth + 1);
        continue;
      }
      const file = await handle.getFile();
      if (file.size > MAX_FILE_BYTES) throw new Error("Arquivo excede 8 MiB: " + relative);
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Projeto excede 48 MiB de arquivos para o runtime Node.");
      if (files.size >= MAX_FILES) throw new Error("Projeto excede 3.000 arquivos para o runtime Node.");
      files.set(relative, new Uint8Array(await file.arrayBuffer()));
    }
  }
  await walk(root, "", 0);
  return { files, directories, totalBytes };
}

async function readLocal(root, relative) {
  const parts = safePath(relative).split("/").filter(Boolean);
  if (!parts.length) return null;
  const name = parts.pop();
  let directory = root;
  try {
    for (const part of parts) directory = await directory.getDirectoryHandle(part);
    const handle = await directory.getFileHandle(name);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if (error?.name === "NotFoundError" || error?.name === "TypeMismatchError") return null;
    throw error;
  }
}

async function writeLocal(root, relative, bytes) {
  const parts = safePath(relative).split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) throw new Error("Não é permitido substituir a raiz do projeto.");
  let directory = root;
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true });
  const handle = await directory.getFileHandle(name, { create: true });
  const writer = await handle.createWritable();
  try {
    await writer.write(bytes);
    await writer.close();
  } catch (error) {
    try { await writer.abort?.(); } catch (_) {}
    throw error;
  }
}

async function removeLocal(root, relative) {
  const parts = safePath(relative).split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) return;
  let directory = root;
  for (const part of parts) directory = await directory.getDirectoryHandle(part);
  await directory.removeEntry(name);
}

async function readVfsTree(runtime, directory, prefix, output, depth = 0) {
  if (depth > 18) throw new Error("Árvore Node excede o limite de profundidade.");
  for (const name of await runtime.fs.readdir(directory)) {
    if (excluded(name)) continue;
    const path = directory === "/" ? "/" + name : directory.replace(/\/+$/, "") + "/" + name;
    const relative = safePath(prefix ? prefix + "/" + name : name);
    const stat = await runtime.fs.stat(path);
    if (stat.isDirectory()) {
      await readVfsTree(runtime, path, relative, output, depth + 1);
      continue;
    }
    if (output.files.size >= MAX_FILES) throw new Error("Runtime Node excedeu o limite de 3.000 arquivos sincronizáveis.");
    const bytes = await runtime.fs.readFile(path, "buffer");
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Arquivo do runtime excede 8 MiB: " + relative);
    output.totalBytes += bytes.byteLength;
    if (output.totalBytes > MAX_TOTAL_BYTES) throw new Error("Runtime Node excedeu o limite de 48 MiB sincronizáveis.");
    output.files.set(relative, bytes);
  }
}

async function syncFromProject(state) {
  const current = await scanProject(state.root);
  for (const relative of state.base.keys()) {
    if (!current.files.has(relative)) {
      const path = state.projectPath + "/" + relative;
      if (await state.runtime.fs.exists(path)) await state.runtime.fs.rm(path, { recursive: true });
    }
  }
  for (const directory of current.directories) {
    if (directory) await state.runtime.fs.mkdir(state.projectPath + "/" + directory, { recursive: true });
  }
  for (const [relative, bytes] of current.files) {
    const previous = state.base.get(relative);
    if (!previous || !equalBytes(previous, bytes)) {
      await state.runtime.fs.writeFile(state.projectPath + "/" + relative, bytes);
    }
  }
  state.base = new Map([...current.files].map(([name, bytes]) => [name, bytes.slice()]));
  await state.runtime.fs.writeFile(state.projectPath + "/.aurora-node-index.json", JSON.stringify([...state.base.keys()]));
}

async function syncToProject(state) {
  const current = { files: new Map(), totalBytes: 0 };
  await readVfsTree(state.runtime, state.projectPath, "", current);
  let written = 0, conflicts = 0, deleted = 0;
  for (const [relative, bytes] of current.files) {
    const previous = state.base.get(relative);
    if (previous && equalBytes(previous, bytes)) continue;
    const local = await readLocal(state.root, relative);
    if ((previous && equalBytes(local, previous)) || (!previous && !local)) {
      await writeLocal(state.root, relative, bytes);
      state.base.set(relative, bytes.slice());
      written++;
    } else {
      conflicts++;
      if (local) await state.runtime.fs.writeFile(state.projectPath + "/" + relative, local);
    }
  }
  for (const [relative, previous] of [...state.base]) {
    if (current.files.has(relative)) continue;
    const local = await readLocal(state.root, relative);
    if (local && equalBytes(local, previous)) {
      try { await removeLocal(state.root, relative); deleted++; } catch (_) { conflicts++; }
    } else if (local) {
      conflicts++;
      await state.runtime.fs.writeFile(state.projectPath + "/" + relative, local);
    }
    state.base.delete(relative);
  }
  await state.runtime.fs.writeFile(state.projectPath + "/.aurora-node-index.json", JSON.stringify([...state.base.keys()]));
  await window.AuroraProjectManager?.refresh?.({ force: true });
  return { written, conflicts, deleted };
}

async function ensure(session, root) {
  if (session.nodeRuntime && session.nodeRuntime.root === root) return session.nodeRuntime;
  if (session.nodeRuntime) {
    try { session.nodeRuntime.runtime.teardown(); } catch (_) {}
    session.nodeRuntime = null;
  }
  const id = await getProjectId(root);
  const NodeBrowser = await loadApi();
  let runtime;
  try {
    runtime = await NodeBrowser.boot({ persist: true });
  } catch (error) {
    runtime = await NodeBrowser.boot({ persist: false });
    session.nodeRuntimePersistenceWarning = error?.message || String(error);
  }
  const projectPath = "/home/projects/" + id + "/project";
  await runtime.fs.mkdir(projectPath, { recursive: true });
  const state = { root, runtime, projectPath, base: new Map(), id };
  session.nodeRuntime = state;
  await syncFromProject(state);
  return state;
}

async function run(session, command, args, options = {}) {
  const root = options.rootHandle || window.AuroraProjectManager?.rootHandle;
  if (!root) throw new Error("Abra um projeto antes de executar Node.js.");
  let permission = await root.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") permission = await root.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") throw new Error("Acesso ao projeto não autorizado.");
  const state = await ensure(session, root);
  await window.AuroraProjectManager?.flush?.();
  await syncFromProject(state);

  const rest = args.slice();
  if (command === "node" && !rest.length) throw new Error("Uso: node arquivo.js ou node -e \"código\".");
  if (command === "npm" && !rest.length) rest.push("--help");
  const cwd = state.projectPath + (options.cwd ? "/" + safePath(options.cwd) : "");
  const env = Object.fromEntries(Object.entries(options.environment || {}).map(([key, value]) => [key, String(value)]));
  const process = await state.runtime.spawn(command, rest, { cwd, env });
  session.nodeProcess = process;
  session.cancelExecution = () => {
    try { process.kill(); } catch (_) {}
    try { state.runtime.killTree?.(process.pid); } catch (_) {}
  };
  let output = "";
  try {
    const reader = process.output.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        output += value;
        options.onOutput?.(value);
      }
    }
    const code = await process.exit;
    const sync = await syncToProject(state);
    return { code, output, sync, persistenceWarning: session.nodeRuntimePersistenceWarning || null };
  } finally {
    session.nodeProcess = null;
    session.cancelExecution = null;
  }
}

function dispose(session) {
  if (!session?.nodeRuntime) return;
  try { session.nodeRuntime.runtime.teardown(); } catch (_) {}
  session.nodeRuntime = null;
  session.nodeProcess = null;
}

window.AuroraNodeRuntime = Object.freeze({ run, dispose });
})();