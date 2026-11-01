(() => {
"use strict";

const GIT_MODULE = "https://esm.sh/isomorphic-git@1.36.1";
const HTTP_MODULE = "https://esm.sh/isomorphic-git@1.36.1/http/web";

function normalizePath(value) {
  const input = String(value || "/");
  if (input.includes("\\") || input.includes("\0")) throw new Error("Caminho Git inválido.");
  const parts = [];
  for (const part of input.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error("O Git não pode acessar fora da raiz do projeto.");
      parts.pop();
      continue;
    }
    if (/[<>:"|?*]/.test(part)) throw new Error("Caminho Git inválido.");
    parts.push(part);
  }
  return "/" + parts.join("/");
}

function makeError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createFileSystem(root) {
  async function directory(path, create = false) {
    let current = root;
    for (const part of normalizePath(path).split("/").filter(Boolean)) {
      try {
        current = await current.getDirectoryHandle(part, { create });
      } catch (error) {
        if (error?.name === "NotFoundError") throw makeError("Diretório não encontrado: " + path, "ENOENT");
        if (error?.name === "TypeMismatchError") throw makeError("Não é um diretório: " + part, "ENOTDIR");
        throw error;
      }
    }
    return current;
  }

  async function entry(path) {
    const normalized = normalizePath(path);
    const parts = normalized.split("/").filter(Boolean);
    if (!parts.length) return { kind: "directory", handle: root, path: normalized };
    const name = parts.pop();
    const parent = await directory("/" + parts.join("/"));
    try {
      return { kind: "file", handle: await parent.getFileHandle(name), parent, name, path: normalized };
    } catch (error) {
      if (error?.name !== "NotFoundError" && error?.name !== "TypeMismatchError") throw error;
    }
    try {
      return { kind: "directory", handle: await parent.getDirectoryHandle(name), parent, name, path: normalized };
    } catch (error) {
      if (error?.name === "NotFoundError") throw makeError("Arquivo ou diretório não encontrado: " + normalized, "ENOENT");
      if (error?.name === "TypeMismatchError") throw makeError("Tipo de arquivo incompatível: " + normalized, "EISDIR");
      throw error;
    }
  }

  function stats(item) {
    let size = 0, modified = new Date(0);
    return (async () => {
      if (item.kind === "file") {
        const file = await item.handle.getFile();
        size = file.size;
        modified = new Date(file.lastModified || 0);
      }
      return {
        size,
        mode: item.kind === "directory" ? 0o040755 : 0o100644,
        mtime: modified,
        ctime: modified,
        atime: modified,
        isFile: () => item.kind === "file",
        isDirectory: () => item.kind === "directory",
        isSymbolicLink: () => false
      };
    })();
  }

  const promises = {
    async readFile(path, options) {
      const item = await entry(path);
      if (item.kind !== "file") throw makeError("É um diretório: " + path, "EISDIR");
      const file = await item.handle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const encoding = typeof options === "string" ? options : options?.encoding;
      return encoding ? new TextDecoder(encoding).decode(bytes) : bytes;
    },
    async writeFile(path, data) {
      const normalized = normalizePath(path);
      const parts = normalized.split("/").filter(Boolean);
      const name = parts.pop();
      if (!name) throw makeError("Não é possível gravar na raiz do projeto.", "EISDIR");
      const parent = await directory("/" + parts.join("/"), true);
      const handle = await parent.getFileHandle(name, { create: true });
      const writer = await handle.createWritable();
      try {
        await writer.write(data instanceof Uint8Array || data instanceof ArrayBuffer ? data : String(data));
        await writer.close();
      } catch (error) {
        try { await writer.abort?.(); } catch (_) {}
        throw error;
      }
    },
    async unlink(path) {
      const item = await entry(path);
      if (item.kind !== "file") throw makeError("É um diretório: " + path, "EISDIR");
      await item.parent.removeEntry(item.name);
    },
    async readdir(path) {
      const item = await entry(path);
      if (item.kind !== "directory") throw makeError("Não é um diretório: " + path, "ENOTDIR");
      const names = [];
      for await (const [name] of item.handle.entries()) names.push(name);
      return names.sort();
    },
    async mkdir(path, options = {}) {
      const normalized = normalizePath(path);
      if (normalized === "/") return;
      const parts = normalized.split("/").filter(Boolean);
      const name = parts.pop();
      const parent = await directory("/" + parts.join("/"), Boolean(options?.recursive));
      try { await parent.getDirectoryHandle(name, { create: true }); }
      catch (error) {
        if (error?.name === "TypeMismatchError") throw makeError("Já existe um arquivo com esse nome.", "EEXIST");
        throw error;
      }
    },
    async rmdir(path) {
      const item = await entry(path);
      if (item.kind !== "directory") throw makeError("Não é um diretório: " + path, "ENOTDIR");
      if (!item.name) throw makeError("A raiz do projeto não pode ser removida.", "EPERM");
      await item.parent.removeEntry(item.name);
    },
    async stat(path) { return stats(await entry(path)); },
    async lstat(path) { return stats(await entry(path)); },
    async readlink() { throw makeError("Links simbólicos não são suportados pelo armazenamento do navegador.", "ENOTSUP"); },
    async symlink() { throw makeError("Links simbólicos não são suportados pelo armazenamento do navegador.", "ENOTSUP"); },
    async chmod() {}
  };

  return { promises };
}

async function loadGit() {
  if (!loadGit.promise) {
    loadGit.promise = Promise.all([import(GIT_MODULE), import(HTTP_MODULE)]).then(([gitModule, httpModule]) => ({
      git: gitModule.default || gitModule,
      http: httpModule.default || httpModule
    })).catch(error => {
      loadGit.promise = null;
      throw new Error("Não foi possível carregar a biblioteca Git segura para o navegador: " + (error?.message || String(error)));
    });
  }
  return loadGit.promise;
}

function authOptions(environment) {
  const token = environment?.GITHUB_TOKEN || environment?.GH_TOKEN;
  return token ? { onAuth: () => ({ username: "x-access-token", password: token }) } : {};
}

function parseCommitMessage(args) {
  const index = args.indexOf("-m");
  if (index < 0 || !args[index + 1]) throw new Error('Uso: git commit -m "mensagem"');
  return args.slice(index + 1).join(" ");
}

async function run(args, context = {}) {
  const root = context.rootHandle || window.AuroraProjectManager?.rootHandle;
  if (!root) throw new Error("Abra um projeto antes de usar Git.");
  const permission = await root.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") throw new Error("Autorize novamente a leitura e gravação do projeto.");
  const { git, http } = await loadGit();
  const fs = createFileSystem(root);
  const cwd = normalizePath("/" + String(context.cwd || "").replace(/^\/+/, ""));
  const dir = cwd;
  const command = String(args[0] || "status").toLowerCase();
  const rest = args.slice(1);
  const auth = authOptions(context.environment);

  if (command === "help" || command === "--help" || command === "-h") {
    return [
      "Git no navegador (isomorphic-git, sem processo nativo):",
      "git init | status | add -A | add arquivo | commit -m mensagem | log [n]",
      "git branch [nome] | checkout [-b] nome | clone URL [pasta]",
      "git remote -v | remote add nome URL | fetch [remoto] | pull [remoto] [branch] | push [remoto] [branch]",
      "git config user.name valor | git config user.email valor | git ls-files",
      "Para push em GitHub: export GITHUB_TOKEN=seu_token (válido somente nesta sessão).",
      "O token não é salvo em disco nem exibido no terminal. Use HTTPS e escopos mínimos."
    ].join("\n");
  }

  switch (command) {
    case "init": {
      await git.init({ fs, dir, defaultBranch: "main" });
      return "Repositório Git inicializado em " + dir;
    }
    case "status": {
      const branch = await git.currentBranch({ fs, dir, fullname: false });
      const matrix = await git.statusMatrix({ fs, dir });
      const lines = ["Na branch " + (branch || "(sem branch)")];
      const changes = matrix.filter(([, head, workdir, stage]) => head !== workdir || head !== stage || workdir !== stage);
      if (!changes.length) lines.push("Árvore de trabalho limpa.");
      for (const [file, head, workdir, stage] of changes) {
        const label = head === 0 && workdir > 0 ? "não rastreado" :
          head > 0 && workdir === 0 ? "excluído" :
          head === workdir && stage !== workdir ? "preparado" :
          head !== workdir && stage === head ? "modificado" : "alterado";
        lines.push("  " + label + ": " + file);
      }
      return lines.join("\n");
    }
    case "add": {
      if (!rest.length) throw new Error("Uso: git add -A | git add arquivo");
      if (rest.includes("-A") || rest.includes("--all") || rest.includes(".")) {
        const matrix = await git.statusMatrix({ fs, dir });
        for (const [filepath, head, workdir] of matrix) {
          if (workdir === 0 && head > 0) await git.remove({ fs, dir, filepath });
          else if (workdir > 0) await git.add({ fs, dir, filepath });
        }
        return "Alterações do projeto preparadas.";
      }
      for (const file of rest) {
        const filepath = normalizePath(dir + "/" + file).slice(dir.length + (dir === "/" ? 0 : 1));
        const matrix = await git.statusMatrix({ fs, dir, filepaths: [filepath] });
        const row = matrix.find(item => item[0] === filepath);
        if (row && row[2] === 0 && row[1] > 0) await git.remove({ fs, dir, filepath });
        else await git.add({ fs, dir, filepath });
      }
      return "Arquivo(s) preparado(s).";
    }
    case "commit": {
      const message = parseCommitMessage(rest);
      const name = await git.getConfig({ fs, dir, path: "user.name" });
      const email = await git.getConfig({ fs, dir, path: "user.email" });
      if (!name || !email) throw new Error('Configure sua identidade: git config user.name "Seu nome" e git config user.email "voce@exemplo.com".');
      const oid = await git.commit({ fs, dir, message, author: { name, email } });
      return "Commit criado: " + oid.slice(0, 12);
    }
    case "log": {
      const depth = Math.max(1, Math.min(50, Number(rest[0]) || 10));
      const commits = await git.log({ fs, dir, depth });
      return commits.map(item => "commit " + item.oid + "\nAutor: " + item.commit.author.name + " <" + item.commit.author.email + ">\nData: " + new Date(item.commit.author.timestamp * 1000).toISOString() + "\n\n    " + item.commit.message.trim()).join("\n\n") || "Nenhum commit.";
    }
    case "branch": {
      if (rest[0]) {
        await git.branch({ fs, dir, ref: rest[0] });
        return "Branch criada: " + rest[0];
      }
      const current = await git.currentBranch({ fs, dir, fullname: false });
      const branches = await git.listBranches({ fs, dir });
      return branches.map(name => (name === current ? "* " : "  ") + name).join("\n") || "Nenhuma branch.";
    }
    case "checkout": {
      if (!rest[0]) throw new Error("Uso: git checkout [-b] nome");
      if (rest[0] === "-b") {
        if (!rest[1]) throw new Error("Informe o nome da branch.");
        await git.branch({ fs, dir, ref: rest[1] });
        await git.checkout({ fs, dir, ref: rest[1] });
        return "Branch criada e selecionada: " + rest[1];
      }
      await git.checkout({ fs, dir, ref: rest[0] });
      await window.AuroraProjectManager?.refresh?.({ force: true });
      return "Branch selecionada: " + rest[0];
    }
    case "clone": {
      if (!rest[0]) throw new Error("Uso: git clone https://github.com/usuario/repositorio [pasta]");
      const url = new URL(rest[0]);
      if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password) {
        throw new Error("Clone permitido somente de URLs HTTPS públicas do github.com, sem credenciais embutidas.");
      }
      const repository = url.pathname.replace(/\.git$/i, "").split("/").filter(Boolean);
      if (repository.length !== 2) throw new Error("Informe uma URL de repositório GitHub válida.");
      const target = normalizePath(dir + "/" + (rest[1] || repository[1]));
      await git.clone({ fs, http, dir: target, url: url.href.replace(/\.git$/i, ""), singleBranch: true, depth: 1, ...auth });
      await window.AuroraProjectManager?.refresh?.({ force: true });
      return "Repositório clonado em " + target;
    }
    case "remote": {
      if (rest[0] === "-v") {
        const remotes = await git.listRemotes({ fs, dir });
        return remotes.map(item => item.remote + "\t" + item.url + " (fetch)\n" + item.remote + "\t" + item.url + " (push)").join("\n") || "Nenhum remoto configurado.";
      }
      if (rest[0] === "add" && rest[1] && rest[2]) {
        const url = new URL(rest[2]);
        if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password) {
          throw new Error("Remotos permitidos somente por HTTPS no github.com, sem credenciais embutidas.");
        }
        await git.addRemote({ fs, dir, remote: rest[1], url: url.href });
        return "Remoto adicionado: " + rest[1];
      }
      throw new Error("Uso: git remote -v | git remote add origin URL");
    }
    case "config": {
      if (rest[0] !== "user.name" && rest[0] !== "user.email") throw new Error("Somente git config user.name e user.email são suportados.");
      const value = rest.slice(1).join(" ");
      if (!value) throw new Error("Informe um valor para " + rest[0] + ".");
      await git.setConfig({ fs, dir, path: rest[0], value });
      return "Configuração local atualizada: " + rest[0];
    }
    case "fetch": {
      const remote = rest[0] || "origin";
      await git.fetch({ fs, http, dir, remote, ...auth });
      return "Referências remotas atualizadas.";
    }
    case "pull": {
      const remote = rest[0] || "origin";
      const branch = rest[1] || await git.getConfig({ fs, dir, path: "branch." + (await git.currentBranch({ fs, dir, fullname: false })) + ".merge" });
      await git.pull({ fs, http, dir, remote, ...(branch ? { ref: branch.replace(/^refs\/heads\//, "") } : {}), singleBranch: true, ...auth });
      await window.AuroraProjectManager?.refresh?.({ force: true });
      return "Alterações remotas integradas.";
    }
    case "push": {
      const remote = rest[0] || "origin";
      const branch = rest[1] || await git.currentBranch({ fs, dir, fullname: false });
      if (!context.environment?.GITHUB_TOKEN && !context.environment?.GH_TOKEN) {
        throw new Error("Defina GITHUB_TOKEN na sessão antes de enviar alterações: export GITHUB_TOKEN=...");
      }
      await git.push({ fs, http, dir, remote, ref: branch, ...auth });
      return "Alterações enviadas para " + remote + "/" + branch + ".";
    }
    case "ls-files": {
      const files = await git.listFiles({ fs, dir });
      return files.join("\n") || "Nenhum arquivo rastreado.";
    }
    default:
      throw new Error("Subcomando Git não suportado: " + command + ". Digite git help.");
  }
}

window.AuroraGit = Object.freeze({ run });
window.AuroraGitInternals = Object.freeze({ normalizePath, createFileSystem });
})();