(() => {
"use strict";

const PYODIDE_MODULE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs";
const MAX_FILES = 1500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

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
  return name === ".git" || name === ".aurora" || name === "node_modules" || name === "__pycache__";
}

function equalBytes(a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function scanProject(root) {
  const files = new Map();
  const directories = new Set([""]);
  let totalBytes = 0;
  async function walk(directory, prefix, depth) {
    if (depth > 18) throw new Error("Projeto excede a profundidade máxima de 18 diretórios.");
    for await (const [name, handle] of directory.entries()) {
      if (excluded(name)) continue;
      const relative = safePath(prefix ? prefix + "/" + name : name);
      if (handle.kind === "directory") {
        directories.add(relative);
        await walk(handle, relative, depth + 1);
        continue;
      }
      const file = await handle.getFile();
      if (file.name.endsWith(".pyc")) continue;
      if (file.size > MAX_FILE_BYTES) throw new Error("Arquivo excede 2 MiB para o runtime Python: " + relative);
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Projeto excede 32 MiB para o runtime Python.");
      if (files.size >= MAX_FILES) throw new Error("Projeto excede 1.500 arquivos para o runtime Python.");
      files.set(relative, new Uint8Array(await file.arrayBuffer()));
    }
  }
  await walk(root, "", 0);
  return { files, directories };
}

async function readLocal(root, relative) {
  const parts = safePath(relative).split("/").filter(Boolean);
  if (!parts.length) return null;
  const name = parts.pop();
  let directory = root;
  try {
    for (const part of parts) directory = await directory.getDirectoryHandle(part);
    const handle = await directory.getFileHandle(name);
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
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

async function syncToProject(root, baseline, returnedFiles) {
  const current = new Map();
  let totalBytes = 0;
  for (const item of returnedFiles || []) {
    const relative = safePath(item.path);
    if (!relative || relative.split("/").some(excluded) || relative.endsWith(".pyc")) continue;
    const bytes = new Uint8Array(item.bytes);
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Python gerou arquivo acima de 2 MiB: " + relative);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES || current.size >= MAX_FILES) throw new Error("Saída Python excede os limites de sincronização.");
    current.set(relative, bytes);
  }

  let written = 0, deleted = 0, conflicts = 0;
  for (const [relative, bytes] of current) {
    const previous = baseline.get(relative);
    if (previous && equalBytes(previous, bytes)) continue;
    const local = await readLocal(root, relative);
    if ((previous && equalBytes(local, previous)) || (!previous && !local)) {
      await writeLocal(root, relative, bytes);
      written++;
    } else {
      conflicts++;
    }
  }

  for (const [relative, previous] of baseline) {
    if (current.has(relative)) continue;
    const local = await readLocal(root, relative);
    if (local && equalBytes(local, previous)) {
      try { await removeLocal(root, relative); deleted++; } catch (_) { conflicts++; }
    } else if (local) {
      conflicts++;
    }
  }

  await window.AuroraProjectManager?.refresh?.({ force: true });
  return { written, deleted, conflicts };
}

function workerSource() {
  return [
    'import { loadPyodide } from "' + PYODIDE_MODULE + '";',
    'let py = null;',
    'const MAX_FILES = 1500;',
    'const MAX_FILE_BYTES = 2097152;',
    'const MAX_TOTAL_BYTES = 33554432;',
    'function collectWorkspace() {',
    '  const files = []; let total = 0;',
    '  function walk(directory, prefix, depth) {',
    '    if (depth > 18) throw new Error("Workspace Python excede 18 níveis.");',
    '    for (const name of py.FS.readdir(directory)) {',
    '      if (name === "." || name === ".." || name === ".git" || name === ".aurora" || name === "node_modules" || name === "__pycache__" || name.endsWith(".pyc")) continue;',
    '      const path = directory.endsWith("/") ? directory + name : directory + "/" + name;',
    '      const relative = prefix ? prefix + "/" + name : name;',
    '      const stat = py.FS.stat(path);',
    '      if (py.FS.isDir(stat.mode)) walk(path, relative, depth + 1);',
    '      else if (py.FS.isFile(stat.mode)) {',
    '        const bytes = py.FS.readFile(path);',
    '        if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Arquivo Python acima de 2 MiB: " + relative);',
    '        total += bytes.byteLength;',
    '        if (total > MAX_TOTAL_BYTES || files.length >= MAX_FILES) throw new Error("Workspace Python excedeu os limites de sincronização.");',
    '        files.push({ path: relative, bytes });',
    '      }',
    '    }',
    '  }',
    '  walk("/workspace", "", 0); return files;',
    '}',
    'self.onmessage = async event => {',
    '  const data = event.data || {};',
    '  try {',
    '    if (!py) {',
    '      py = await loadPyodide({',
    '        stdout: { batched: text => postMessage({ type: "out", text }) },',
    '        stderr: { batched: text => postMessage({ type: "err", text }) }',
    '      });',
    '      py.FS.mkdirTree("/workspace");',
    '    }',
    '    for (const item of data.files || []) {',
    '      const path = "/workspace/" + item.path;',
    '      py.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));',
    '      py.FS.writeFile(path, item.bytes);',
    '    }',
    '    const cwd = data.cwd ? "/workspace/" + data.cwd : "/workspace";',
    '    py.FS.mkdirTree(cwd); py.FS.chdir(cwd);',
    '    await py.runPythonAsync(data.code);',
    '    const files = collectWorkspace();',
    '    postMessage({ type: "files", files }, files.map(item => item.bytes.buffer));',
    '    postMessage({ type: "done" });',
    '  } catch (error) {',
    '    try { const files = collectWorkspace(); postMessage({ type: "files", files }, files.map(item => item.bytes.buffer)); } catch (_) {}',
    '    postMessage({ type: "fail", error: error?.stack || error?.message || String(error) });',
    '  }',
    '};'
  ].join("\n");
}

async function run(session, code, options = {}) {
  const root = options.rootHandle || window.AuroraProjectManager?.rootHandle;
  if (!root) throw new Error("Abra um projeto antes de executar Python.");
  let permission = await root.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") permission = await root.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") throw new Error("Acesso ao projeto não autorizado.");

  await window.AuroraProjectManager?.flush?.();
  const snapshot = await scanProject(root);
  const cwd = safePath(options.cwd || "");
  if (cwd && !snapshot.directories.has(cwd)) throw new Error("Pasta atual não existe no projeto: " + cwd);
  const files = [...snapshot.files].map(([path, bytes]) => ({ path, bytes: bytes.slice() }));
  const transfer = files.map(item => item.bytes.buffer);
  const blobUrl = URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" }));
  let worker;
  try { worker = new Worker(blobUrl, { type: "module" }); }
  finally { URL.revokeObjectURL(blobUrl); }
  session.worker = worker;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate();
      session.worker = null;
      session.cancelExecution = null;
      reject(new Error("Python excedeu o limite de 90 segundos."));
    }, 90000);
    let returnedFiles = null;
    let output = "";
    let settled = false;

    const finish = async (success, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      session.worker = null;
      session.cancelExecution = null;
      let sync = { written: 0, deleted: 0, conflicts: 0 };
      try {
        if (returnedFiles) sync = await syncToProject(root, snapshot.files, returnedFiles);
      } catch (syncError) {
        if (!error) error = syncError;
        success = false;
      }
      if (error) reject(new Error((error?.message || String(error)) + (sync.conflicts ? " (" + sync.conflicts + " conflito(s) preservado(s))" : "")));
      else resolve({ code: success ? 0 : 1, output, sync });
    };

    session.cancelExecution = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      session.worker = null;
      session.cancelExecution = null;
      resolve({ code: 130, output, sync: { written: 0, deleted: 0, conflicts: 0 } });
    };

    worker.onmessage = event => {
      const data = event.data || {};
      if (data.type === "out" || data.type === "err") {
        const chunk = String(data.text || "");
        output += chunk;
        options.onOutput?.(data.type === "err" ? "\x1b[31m" + chunk + "\x1b[0m" : chunk);
      } else if (data.type === "files") {
        returnedFiles = data.files || [];
      } else if (data.type === "done") {
        finish(true, null);
      } else if (data.type === "fail") {
        finish(false, new Error(data.error || "Falha na execução Python."));
      }
    };
    worker.onerror = event => finish(false, new Error(event.message || "Falha no Worker Python."));
    worker.postMessage({ code: String(code), cwd, files }, transfer);
  });
}

window.AuroraPythonRuntime = Object.freeze({ run });
})();