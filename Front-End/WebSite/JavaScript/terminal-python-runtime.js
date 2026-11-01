(() => {
"use strict";

const PYODIDE_MODULE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs";
const PYTHON_ASYNC_INPUT_BOOTSTRAP = "\nimport ast as _aurora_ast\nimport inspect as _aurora_inspect\n\nasync def __aurora_input(prompt=\"\"):\n    value = await __aurora_input_js(str(prompt))\n    if value is None:\n        raise EOFError(\"EOF quando lendo uma linha\")\n    return str(value)\n\nasync def __aurora_sleep(seconds):\n    import asyncio as _aurora_asyncio\n    delay = float(seconds)\n    if delay < 0:\n        raise ValueError(\"sleep length must be non-negative\")\n    await _aurora_asyncio.sleep(delay)\n\nasync def __aurora_run(source):\n    tree = _aurora_ast.parse(source, filename=\"<aurora>\", mode=\"exec\")\n    time_modules = {\"time\"}\n    sleep_functions = set()\n    for imported in _aurora_ast.walk(tree):\n        if isinstance(imported, _aurora_ast.Import):\n            for alias in imported.names:\n                if alias.name == \"time\":\n                    time_modules.add(alias.asname or alias.name)\n        elif isinstance(imported, _aurora_ast.ImportFrom) and imported.module == \"time\":\n            for alias in imported.names:\n                if alias.name == \"sleep\":\n                    sleep_functions.add(alias.asname or alias.name)\n    def is_sleep_call(node):\n        if isinstance(node.func, _aurora_ast.Name):\n            return node.func.id in sleep_functions\n        return (isinstance(node.func, _aurora_ast.Attribute) and node.func.attr == \"sleep\" and\n                isinstance(node.func.value, _aurora_ast.Name) and node.func.value.id in time_modules)\n    function_info = {}\n    class Scanner(_aurora_ast.NodeVisitor):\n        def __init__(self):\n            self.calls = set()\n            self.has_input = False\n            self.has_sleep = False\n            self.has_yield = False\n        def visit_FunctionDef(self, node):\n            return\n        def visit_AsyncFunctionDef(self, node):\n            return\n        def visit_Lambda(self, node):\n            return\n        def visit_Call(self, node):\n            if isinstance(node.func, _aurora_ast.Name):\n                if node.func.id == \"input\":\n                    self.has_input = True\n                elif is_sleep_call(node):\n                    self.has_sleep = True\n                else:\n                    self.calls.add(node.func.id)\n            elif isinstance(node.func, _aurora_ast.Attribute):\n                if is_sleep_call(node):\n                    self.has_sleep = True\n                else:\n                    self.calls.add(node.func.attr)\n            self.generic_visit(node)\n        def visit_Yield(self, node):\n            self.has_yield = True\n            self.generic_visit(node)\n        def visit_YieldFrom(self, node):\n            self.has_yield = True\n            self.generic_visit(node)\n\n    functions = [node for node in _aurora_ast.walk(tree)\n                 if isinstance(node, (_aurora_ast.FunctionDef, _aurora_ast.AsyncFunctionDef))]\n    for function in functions:\n        scanner = Scanner()\n        for statement in function.body:\n            scanner.visit(statement)\n        function_info[function.name] = {\n            \"calls\": scanner.calls,\n            \"input\": scanner.has_input,\n            \"sleep\": scanner.has_sleep,\n            \"yield\": scanner.has_yield,\n            \"async\": isinstance(function, _aurora_ast.AsyncFunctionDef),\n        }\n\n    async_names = {name for name, info in function_info.items() if info[\"input\"] or info[\"sleep\"]}\n    changed = True\n    while changed:\n        changed = False\n        for name, info in function_info.items():\n            if name not in async_names and info[\"calls\"].intersection(async_names):\n                async_names.add(name)\n                changed = True\n\n    for name in async_names:\n        if function_info[name][\"yield\"] and not function_info[name][\"async\"]:\n            raise SyntaxError(\"input() não pode ser usado em uma função geradora síncrona: \" + name)\n\n    class Transformer(_aurora_ast.NodeTransformer):\n        def __init__(self):\n            self.inside_await = 0\n        def visit_Await(self, node):\n            self.inside_await += 1\n            node.value = self.visit(node.value)\n            self.inside_await -= 1\n            return node\n        def visit_FunctionDef(self, node):\n            node = self.generic_visit(node)\n            if node.name not in async_names:\n                return node\n            return _aurora_ast.AsyncFunctionDef(\n                name=node.name, args=node.args, body=node.body,\n                decorator_list=node.decorator_list, returns=node.returns,\n                type_comment=node.type_comment,\n                type_params=getattr(node, \"type_params\", [])\n            )\n        def visit_Call(self, node):\n            node = self.generic_visit(node)\n            if isinstance(node.func, _aurora_ast.Name) and node.func.id == \"input\":\n                args = node.args[:1] if node.args else [_aurora_ast.Constant(value=\"\")]\n                return _aurora_ast.copy_location(_aurora_ast.Await(_aurora_ast.Call(\n                    func=_aurora_ast.Name(id=\"__aurora_input\", ctx=_aurora_ast.Load()),\n                    args=args, keywords=[]\n                )), node)\n            if is_sleep_call(node):\n                return _aurora_ast.copy_location(_aurora_ast.Await(_aurora_ast.Call(\n                    func=_aurora_ast.Name(id=\"__aurora_sleep\", ctx=_aurora_ast.Load()),\n                    args=node.args, keywords=node.keywords\n                )), node)\n            target_name = node.func.id if isinstance(node.func, _aurora_ast.Name) else (\n                node.func.attr if isinstance(node.func, _aurora_ast.Attribute) else None\n            )\n            if target_name in async_names and not self.inside_await:\n                return _aurora_ast.copy_location(_aurora_ast.Await(node), node)\n            return node\n\n    tree = Transformer().visit(tree)\n    _aurora_ast.fix_missing_locations(tree)\n    compiled = compile(tree, \"<aurora>\", \"exec\", flags=_aurora_ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)\n    result = eval(compiled, globals())\n    if _aurora_inspect.isawaitable(result):\n        await result\n";
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
    '      py = await loadPyodide({ fullStdLib: true });',
    '      py.setStdout({ batched: text => postMessage({ type: "out", text }) });',
    '      py.setStderr({ batched: text => postMessage({ type: "err", text }) });',
    '      py.FS.mkdirTree("/workspace");',
    '    }',
    '    for (const item of data.files || []) {',
    '      const path = "/workspace/" + item.path;',
    '      py.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));',
    '      py.FS.writeFile(path, item.bytes);',
    '    }',
    '    const cwd = data.cwd ? "/workspace/" + data.cwd : "/workspace";',
    '    py.FS.mkdirTree(cwd); py.FS.chdir(cwd);',
    '    await py.loadPackagesFromImports(data.code);',
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

  // Async stdin bridge: xterm remains responsive while Python awaits user input.
  let py = null;
  let output = "";
  const stdoutDecoder = new TextDecoder();
  const stderrDecoder = new TextDecoder();
  const emit = (type, value) => {
    const chunk = String(value || "");
    if (!chunk) return;
    output += chunk;
    options.onOutput?.(type === "err" ? "\x1b[31m" + chunk + "\x1b[0m" : chunk);
  };
  const flushOutput = () => {
    emit("out", stdoutDecoder.decode());
    emit("err", stderrDecoder.decode());
  };
  let returnedFiles = null;
  let executionError = null;
  try {
    const module = await import(PYODIDE_MODULE);
    py = await module.loadPyodide({ fullStdLib: true });
    // Preserve every byte written by Python, including embedded and trailing newlines.
    // A batched handler may split output into lines and lose the original write boundaries.
    py.setStdout({ write: buffer => {
      emit("out", stdoutDecoder.decode(buffer, { stream: true }));
      return buffer.byteLength;
    }});
    py.setStderr({ write: buffer => {
      emit("err", stderrDecoder.decode(buffer, { stream: true }));
      return buffer.byteLength;
    }});
    if (typeof options.onInput !== "function") throw new Error("A entrada interativa do terminal Python não está disponível.");
    py.globals.set("__aurora_input_js", prompt => options.onInput(String(prompt || "")));
    await py.runPythonAsync(PYTHON_ASYNC_INPUT_BOOTSTRAP);
    py.FS.mkdirTree("/workspace");
    for (const [relative, bytes] of snapshot.files) {
      const target = "/workspace/" + relative;
      const slash = target.lastIndexOf("/");
      if (slash > 0) py.FS.mkdirTree(target.slice(0, slash));
      py.FS.writeFile(target, bytes);
    }
    const workingDirectory = cwd ? "/workspace/" + cwd : "/workspace";
    py.FS.mkdirTree(workingDirectory);
    py.FS.chdir(workingDirectory);
    await py.loadPackagesFromImports(String(code));
    py.globals.set("__aurora_source", String(code));
    await py.runPythonAsync("await __aurora_run(__aurora_source)");
  } catch (error) {
    executionError = error;
  } finally {
    flushOutput();
    if (py) {
      try {
        const files = [];
        let total = 0;
        const walk = (directory, prefix, depth) => {
          if (depth > 18) throw new Error("Workspace Python excede 18 níveis.");
          for (const name of py.FS.readdir(directory)) {
            if (name === "." || name === ".." || name === ".git" || name === ".aurora" ||
                name === "node_modules" || name === "__pycache__" || name.endsWith(".pyc")) continue;
            const absolute = directory.endsWith("/") ? directory + name : directory + "/" + name;
            const relative = prefix ? prefix + "/" + name : name;
            const stat = py.FS.stat(absolute);
            if (py.FS.isDir(stat.mode)) walk(absolute, relative, depth + 1);
            else if (py.FS.isFile(stat.mode)) {
              const bytes = py.FS.readFile(absolute);
              if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Arquivo Python acima de 2 MiB: " + relative);
              total += bytes.byteLength;
              if (total > MAX_TOTAL_BYTES || files.length >= MAX_FILES) throw new Error("Workspace Python excedeu os limites de sincronização.");
              files.push({ path: relative, bytes });
            }
          }
        };
        walk("/workspace", "", 0);
        returnedFiles = files;
      } catch (error) {
        if (!executionError) executionError = error;
      }
    }
  }

  let sync = { written: 0, deleted: 0, conflicts: 0 };
  try {
    if (returnedFiles) sync = await syncToProject(root, snapshot.files, returnedFiles);
  } catch (error) {
    if (!executionError) executionError = error;
  }
  if (executionError) {
    const message = executionError?.stack || executionError?.message || String(executionError);
    throw new Error(message + (sync.conflicts ? " (" + sync.conflicts + " conflito(s) preservado(s))" : ""));
  }
  return { code: 0, output, sync };
}

window.AuroraPythonRuntime = Object.freeze({ run });
})();