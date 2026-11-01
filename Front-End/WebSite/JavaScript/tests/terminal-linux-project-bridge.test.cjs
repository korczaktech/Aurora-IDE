const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "terminal-linux-project-bridge.js"), "utf8");
const windowMock = {};
vm.runInNewContext(source, { window: windowMock, Uint8Array, Map, Set, Array, String, Error });
const bridge = windowMock.AuroraLinuxProjectBridge;

class FakeFile {
  constructor(name, bytes) {
    this.name = name;
    this.kind = "file";
    this.bytes = new Uint8Array(bytes);
  }
  async getFile() {
    const bytes = this.bytes.slice();
    return { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
  }
  async createWritable() {
    const file = this;
    return {
      async write(bytes) { file.bytes = new Uint8Array(bytes); },
      async close() {}
    };
  }
}

class FakeDirectory {
  constructor(name = "") {
    this.name = name;
    this.kind = "directory";
    this.children = new Map();
  }
  async queryPermission() { return "granted"; }
  async *entries() { for (const entry of this.children) yield entry; }
  async getDirectoryHandle(name, options = {}) {
    let child = this.children.get(name);
    if (!child && options.create) {
      child = new FakeDirectory(name);
      this.children.set(name, child);
    }
    if (!child || child.kind !== "directory") {
      const error = new Error("Directory not found: " + name);
      error.name = "NotFoundError";
      throw error;
    }
    return child;
  }
  async getFileHandle(name, options = {}) {
    let child = this.children.get(name);
    if (!child && options.create) {
      child = new FakeFile(name, []);
      this.children.set(name, child);
    }
    if (!child || child.kind !== "file") {
      const error = new Error("File not found: " + name);
      error.name = "NotFoundError";
      throw error;
    }
    return child;
  }
  addFile(name, content) {
    const bytes = new TextEncoder().encode(content);
    this.children.set(name, new FakeFile(name, bytes));
  }
}

class Fake9p {
  constructor() {
    this.nodes = [{ name: "", parent: -1, directory: true, children: new Map(), bytes: new Uint8Array() }];
  }
  SearchPath(path) {
    const parts = String(path).split("/").filter(Boolean);
    let id = 0;
    let parentid = -1;
    for (const part of parts) {
      parentid = id;
      id = this.nodes[id].children.get(part) ?? -1;
      if (id < 0) return { id: -1, parentid: -1, name: part };
    }
    return { id, parentid, name: parts.at(-1) || "" };
  }
  CreateDirectory(name, parentid) {
    const parent = this.nodes[parentid];
    const id = this.nodes.length;
    this.nodes.push({ name, parent: parentid, directory: true, children: new Map(), bytes: new Uint8Array() });
    parent.children.set(name, id);
    return id;
  }
  async CreateBinaryFile(name, parentid, bytes) {
    const parent = this.nodes[parentid];
    const id = this.nodes.length;
    this.nodes.push({ name, parent: parentid, directory: false, children: new Map(), bytes: new Uint8Array(bytes) });
    parent.children.set(name, id);
    return id;
  }
  GetRecursiveList(dirid, output) {
    for (const [name, id] of this.nodes[dirid].children) {
      output.push({ parentid: dirid, name });
      if (this.nodes[id].directory) this.GetRecursiveList(id, output);
    }
  }
  GetFullPath(id) {
    const parts = [];
    while (id > 0) {
      parts.unshift(this.nodes[id].name);
      id = this.nodes[id].parent;
    }
    return parts.join("/");
  }
  IsDirectory(id) { return this.nodes[id].directory; }
  async read_file(path) {
    const id = this.SearchPath(path).id;
    return id < 0 || this.nodes[id].directory ? null : this.nodes[id].bytes.slice();
  }
  setFile(path, text) {
    const id = this.SearchPath(path).id;
    this.nodes[id].bytes = new TextEncoder().encode(text);
  }
}

test("valida caminhos relativos e bloqueia traversal", () => {
  assert.equal(bridge.validateRelativePath("src/main.rs"), true);
  assert.equal(bridge.validateRelativePath("../secret"), false);
  assert.equal(bridge.validateRelativePath("/etc/passwd"), false);
  assert.equal(bridge.validateRelativePath("src\\main.rs"), false);
});

test("importa estrutura e arquivos do projeto para o filesystem 9p", async () => {
  const root = new FakeDirectory("project");
  const src = new FakeDirectory("src");
  src.addFile("main.rs", "fn main() {}");
  root.children.set("src", src);
  root.addFile("README.md", "Aurora");

  const state = await bridge.createSession(root);
  const guest = new Fake9p();
  const seeded = await bridge.seedFilesystem(guest, state.snapshot);

  assert.equal(seeded.fileCount, 2);
  assert.equal(new TextDecoder().decode(await guest.read_file("README.md")), "Aurora");
  assert.equal(new TextDecoder().decode(await guest.read_file("src/main.rs")), "fn main() {}");
});

test("sincroniza somente alterações Linux e preserva arquivos com conflito no editor", async () => {
  const root = new FakeDirectory("project");
  root.addFile("README.md", "original");
  const src = new FakeDirectory("src");
  root.children.set("src", src);
  src.addFile("main.js", "console.log('original')");
  const state = await bridge.createSession(root);
  const guest = new Fake9p();
  await bridge.seedFilesystem(guest, state.snapshot);

  guest.setFile("README.md", "alterado no Linux");
  guest.setFile("src/main.js", "alterado no Linux");
  root.children.get("src").children.get("main.js").bytes = new TextEncoder().encode("alterado no editor");

  const result = await bridge.syncToProject(guest, state);
  assert.equal(result.written, 1);
  assert.equal(result.conflicts, 1);
  assert.equal(new TextDecoder().decode((await root.getFileHandle("README.md")).bytes), "alterado no Linux");
  assert.equal(new TextDecoder().decode((await root.getDirectoryHandle("src")).children.get("main.js").bytes), "alterado no editor");
});

test("cria no projeto arquivos novos pelo terminal sem apagar arquivos removidos no guest", async () => {
  const root = new FakeDirectory("project");
  root.addFile("keep.txt", "keep");
  const state = await bridge.createSession(root);
  const guest = new Fake9p();
  await bridge.seedFilesystem(guest, state.snapshot);
  const workspace = guest.SearchPath("");
  await guest.CreateBinaryFile("new.txt", workspace.id, new TextEncoder().encode("new"));
  guest.nodes[0].children.delete("keep.txt");

  const result = await bridge.syncToProject(guest, state);
  assert.equal(result.written, 1);
  assert.equal(result.deletedInGuest, 1);
  assert.equal(new TextDecoder().decode((await root.getFileHandle("new.txt")).bytes), "new");
  assert.equal(new TextDecoder().decode((await root.getFileHandle("keep.txt")).bytes), "keep");
});
