(() => {
  "use strict";

  const DEFAULT_LIMITS = Object.freeze({
    maxFiles: 3000,
    maxFileBytes: 8 * 1024 * 1024,
    maxTotalBytes: 48 * 1024 * 1024
  });

  function validSegment(value) {
    return typeof value === "string" &&
      value.length > 0 &&
      value !== "." &&
      value !== ".." &&
      !/[\\/\0<>:"|?*]/.test(value) &&
      !/[. ]$/.test(value) &&
      !Array.from(value).some(char => char.charCodeAt(0) < 32);
  }

  function validateRelativePath(path) {
    return typeof path === "string" &&
      path.length > 0 &&
      !path.startsWith("/") &&
      !path.includes("\\") &&
      path.split("/").every(validSegment);
  }

  async function permission(handle) {
    if (!handle || typeof handle.queryPermission !== "function") {
      throw new Error("O projeto aberto não oferece um diretório autorizado pelo navegador.");
    }
    const result = await handle.queryPermission({ mode: "readwrite" });
    if (result !== "granted") {
      throw new Error("A permissão do projeto expirou. Reabra o projeto e autorize leitura e gravação.");
    }
  }

  async function collectProject(handle, limits = {}) {
    await permission(handle);
    const config = { ...DEFAULT_LIMITS, ...limits };
    const files = new Map();
    const directories = new Set([""]);
    const skipped = [];
    let totalBytes = 0;

    async function visit(directory, prefix, depth) {
      if (depth > 80) throw new Error("O projeto excede a profundidade máxima de 80 diretórios.");
      const children = [];
      for await (const [name, entry] of directory.entries()) {
        if (!validSegment(name)) {
          skipped.push(prefix ? prefix + "/" + name : name);
          continue;
        }
        children.push({ name, entry });
      }
      children.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
      for (const child of children) {
        const path = prefix ? prefix + "/" + child.name : child.name;
        if (child.entry.kind === "directory") {
          directories.add(path);
          await visit(child.entry, path, depth + 1);
          continue;
        }
        if (child.entry.kind !== "file") {
          skipped.push(path);
          continue;
        }
        if (files.size >= config.maxFiles) {
          skipped.push(path + " (limite de arquivos)");
          continue;
        }
        const file = await child.entry.getFile();
        if (file.size > config.maxFileBytes || totalBytes + file.size > config.maxTotalBytes) {
          skipped.push(path + " (limite de tamanho)");
          continue;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        files.set(path, bytes);
        totalBytes += bytes.byteLength;
      }
    }

    await visit(handle, "", 0);
    return { files, directories, skipped, totalBytes };
  }

  function ensureDirectory(fs, path, directoryIds) {
    if (!path) return 0;
    if (directoryIds.has(path)) return directoryIds.get(path);
    const parts = path.split("/");
    let current = "";
    let parentId = 0;
    for (const part of parts) {
      current = current ? current + "/" + part : part;
      if (directoryIds.has(current)) {
        parentId = directoryIds.get(current);
        continue;
      }
      const parentInfo = fs.SearchPath(current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "");
      const parent = current.includes("/") ? parentInfo.id : 0;
      if (parent < 0) throw new Error("Não foi possível criar a pasta do projeto no filesystem Linux: " + current);
      const id = fs.CreateDirectory(part, parent);
      directoryIds.set(current, id);
      parentId = id;
    }
    return parentId;
  }

  async function seedFilesystem(fs, snapshot) {
    if (!fs || typeof fs.CreateDirectory !== "function" ||
        typeof fs.CreateBinaryFile !== "function" || typeof fs.SearchPath !== "function") {
      throw new Error("A versão do v86 não disponibilizou o filesystem 9p necessário para compartilhar o projeto.");
    }
    const directoryIds = new Map([["", 0]]);
    const directories = [...snapshot.directories].filter(Boolean)
      .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
    for (const directory of directories) ensureDirectory(fs, directory, directoryIds);

    for (const [path, bytes] of snapshot.files) {
      const parts = path.split("/");
      const filename = parts.pop();
      const parentPath = parts.join("/");
      const parentId = ensureDirectory(fs, parentPath, directoryIds);
      await fs.CreateBinaryFile(filename, parentId, bytes);
    }
    return { fileCount: snapshot.files.size, totalBytes: snapshot.totalBytes, skipped: snapshot.skipped.slice() };
  }

  function guestFiles(fs) {
    if (!fs || typeof fs.GetRecursiveList !== "function" ||
        typeof fs.GetFullPath !== "function" || typeof fs.SearchPath !== "function" ||
        typeof fs.IsDirectory !== "function" || typeof fs.read_file !== "function") {
      throw new Error("O filesystem Linux não oferece os recursos necessários para sincronização.");
    }
    const entries = [];
    fs.GetRecursiveList(0, entries);
    const result = [];
    for (const entry of entries) {
      const parent = entry.parentid === 0 ? "" : fs.GetFullPath(entry.parentid);
      const path = parent ? parent + "/" + entry.name : entry.name;
      if (!validateRelativePath(path)) continue;
      const found = fs.SearchPath(path);
      if (found.id < 0) continue;
      result.push({ path, directory: fs.IsDirectory(found.id) });
    }
    return result;
  }

  async function getDirectory(root, path, create) {
    let current = root;
    for (const part of path.split("/").filter(Boolean)) {
      current = await current.getDirectoryHandle(part, { create: Boolean(create) });
    }
    return current;
  }

  async function readHostFile(root, path) {
    const parts = path.split("/");
    const filename = parts.pop();
    try {
      const directory = await getDirectory(root, parts.join("/"), false);
      const handle = await directory.getFileHandle(filename);
      return new Uint8Array(await (await handle.getFile()).arrayBuffer());
    } catch (error) {
      if (error && (error.name === "NotFoundError" || error.code === 8)) return null;
      throw error;
    }
  }

  function sameBytes(a, b) {
    if (!a || !b || a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  async function writeHostFile(root, path, bytes) {
    const parts = path.split("/");
    const filename = parts.pop();
    const directory = await getDirectory(root, parts.join("/"), true);
    const handle = await directory.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(bytes);
      await writable.close();
    } catch (error) {
      try { await writable.abort?.(); } catch (_) {}
      throw error;
    }
  }

  async function syncToProject(fs, state) {
    if (!state || !state.rootHandle || !(state.baseline instanceof Map)) {
      throw new Error("Não há projeto vinculado a esta sessão Linux.");
    }
    await permission(state.rootHandle);
    const entries = guestFiles(fs);
    const guestPaths = new Set(entries.filter(entry => !entry.directory).map(entry => entry.path));
    const directories = entries.filter(entry => entry.directory)
      .sort((a, b) => a.path.split("/").length - b.path.split("/").length);
    let createdDirectories = 0;
    for (const entry of directories) {
      await getDirectory(state.rootHandle, entry.path, true);
      createdDirectories++;
    }

    let written = 0;
    let unchanged = 0;
    let conflicts = 0;
    let skippedTooLarge = 0;
    let syncedBytes = 0;
    let consideredFiles = 0;
    for (const entry of entries) {
      if (entry.directory) continue;
      consideredFiles++;
      if (consideredFiles > DEFAULT_LIMITS.maxFiles) { skippedTooLarge++; continue; }
      const data = await fs.read_file(entry.path);
      if (!(data instanceof Uint8Array)) continue;
      if (data.byteLength > DEFAULT_LIMITS.maxFileBytes || syncedBytes + data.byteLength > DEFAULT_LIMITS.maxTotalBytes) {
        skippedTooLarge++;
        continue;
      }
      syncedBytes += data.byteLength;
      const original = state.baseline.get(entry.path);
      if (original && sameBytes(original, data)) {
        unchanged++;
        continue;
      }
      const current = await readHostFile(state.rootHandle, entry.path);
      if (original ? !sameBytes(current, original) : current !== null) {
        conflicts++;
        continue;
      }
      await writeHostFile(state.rootHandle, entry.path, data);
      state.baseline.set(entry.path, data.slice());
      written++;
    }

    const deletedInGuest = [...state.baseline.keys()].filter(path => !guestPaths.has(path)).length;
    return { written, unchanged, conflicts, createdDirectories, deletedInGuest, skippedTooLarge, totalFiles: guestPaths.size };
  }

  async function createSession(rootHandle, limits) {
    const snapshot = await collectProject(rootHandle, limits);
    return {
      rootHandle,
      baseline: new Map([...snapshot.files].map(([path, bytes]) => [path, bytes.slice()])),
      snapshot,
      seeded: false
    };
  }

  window.AuroraLinuxProjectBridge = Object.freeze({
    DEFAULT_LIMITS,
    collectProject,
    seedFilesystem,
    guestFiles,
    createSession,
    syncToProject,
    validateRelativePath
  });
})();