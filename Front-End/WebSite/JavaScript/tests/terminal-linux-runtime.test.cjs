const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "terminal-linux-runtime.js"), "utf8");
const windowMock = {};
vm.runInNewContext(source, {
  window: windowMock,
  URL,
  TextDecoder,
  location: { hostname: "localhost", href: "https://aurora.korczaktech.com.br/JavaScript/terminal-linux-runtime.js" },
  document: { createElement() { throw new Error("O carregamento não deve ocorrer neste teste."); } }
});
const { DEFAULT_CONFIG, normalizeConfig } = windowMock.AuroraLinuxRuntimeInternals;

test("runtime usa versão v86 fixa e recursos HTTPS", () => {
  assert.equal(DEFAULT_CONFIG.version, "0.5.473");
  assert.match(DEFAULT_CONFIG.scriptUrl, /aurora\.korczaktech\.com\.br\/runtime\/linux\/v86\/libv86\.js$/);
  for (const key of ["scriptUrl", "wasmUrl", "biosUrl", "vgaBiosUrl", "kernelUrl"]) {
    assert.equal(new URL(DEFAULT_CONFIG[key]).protocol, "https:");
  }
});

test("runtime mantém memória padrão dentro do intervalo permitido", () => {
  const config = normalizeConfig();
  assert.equal(config.memorySize, 128 * 1024 * 1024);
  assert.equal(config.vgaMemorySize, 8 * 1024 * 1024);
});

test("runtime rejeita memória fora dos limites", () => {
  assert.throws(() => normalizeConfig({ memorySize: 32 * 1024 * 1024 }), /entre 64 MB e 512 MB/);
  assert.throws(() => normalizeConfig({ memorySize: 1024 * 1024 * 1024 }), /entre 64 MB e 512 MB/);
});

test("runtime permite recursos HTTP somente em localhost", () => {
  const config = normalizeConfig({
    scriptUrl: "http://127.0.0.1:4173/runtime/linux/v86/libv86.js"
  });
  assert.equal(new URL(config.scriptUrl).hostname, "127.0.0.1");
  assert.throws(() => normalizeConfig({
    scriptUrl: "http://example.com/libv86.js"
  }), /HTTPS/);
});

test("runtime rejeita URLs inseguras ou inválidas", () => {
  assert.throws(() => normalizeConfig({ kernelUrl: "javascript:alert(1)" }), /HTTPS/);
  assert.throws(() => normalizeConfig({ kernelUrl: "http://example.com/kernel.bin" }), /HTTPS/);
  assert.throws(() => normalizeConfig({ wasmUrl: "não-é-url" }), /URL inválida/);
});

test("runtime rejeita limites de inicialização inválidos", () => {
  assert.throws(() => normalizeConfig({ startupTimeoutMs: 1000 }), /entre 10 e 180 segundos/);
  assert.throws(() => normalizeConfig({ startupTimeoutMs: 200000 }), /entre 10 e 180 segundos/);
});

function createRuntimeHarness(Starter) {
  const window = { V86Starter: Starter, isSecureContext: true };
  const document = {
    createElement() { return { dataset: {}, remove() {} }; },
    head: { append() {} },
    querySelector() { return null; }
  };
  vm.runInNewContext(source, {
    window, document, URL, location: { hostname: "localhost" },
    setTimeout, clearTimeout, AbortController, WebAssembly,
    fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) })
  });
  return window;
}

test("runtime inicia v86 com console serial xterm.js e encerra a máquina", async () => {
  let options;
  let destroyed = false;
  let restarted = false;
  let ran = false;
  class FakeV86 {
    constructor(config) {
      options = config;
      this.listeners = {};
      setTimeout(() => this.listeners["emulator-ready"]?.(), 0);
    }
    add_listener(name, callback) { this.listeners[name] = callback; }
    async run() { ran = true; }
    restart() { restarted = true; this.listeners["serial0-output-byte"]?.("~% "); }
    async destroy() { destroyed = true; }
  }
  const window = createRuntimeHarness(FakeV86);
  const runtime = new window.AuroraLinuxRuntime();
  const consoleContainer = { append() {} };
  await runtime.start({ consoleContainer, xtermLib: function Terminal() {} });
  assert.equal(runtime.state, "running");
  assert.equal(options.serial_console.type, "xtermjs");
  assert.equal(options.serial_console.container, consoleContainer);
  assert.equal(options.serial_console.xterm_lib.name, "Terminal");
  assert.equal(options.bzimage.buffer.byteLength, 8);
  assert.deepEqual(Object.keys(options.filesystem), []);
  assert.equal(options.cmdline, "tsc=reliable mitigations=off random.trust_cpu=on");
  assert.equal(options.disable_keyboard, true);
  assert.equal(options.autostart, false);
  assert.equal(ran, true);
  await runtime.restart();
  assert.equal(restarted, true);
  await runtime.stop();
  assert.equal(destroyed, true);
  assert.equal(runtime.state, "idle");
});

test("runtime cancela a inicialização e libera a máquina sem esperar o timeout", async () => {
  let destroyed = false;
  class FakeV86 {
    constructor() { this.listeners = {}; }
    add_listener(name, callback) { this.listeners[name] = callback; }
    async run() {}
    async destroy() { destroyed = true; }
  }
  const window = createRuntimeHarness(FakeV86);
  const runtime = new window.AuroraLinuxRuntime();
  const starting = runtime.start({
    consoleContainer: { append() {} },
    xtermLib: function Terminal() {}
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  await runtime.stop();
  await assert.rejects(starting, /cancelada/);
  assert.equal(destroyed, true);
  assert.equal(runtime.state, "idle");
});
