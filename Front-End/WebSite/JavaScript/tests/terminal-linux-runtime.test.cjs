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
  location: { hostname: "localhost" },
  document: { createElement() { throw new Error("O carregamento não deve ocorrer neste teste."); } }
});
const { DEFAULT_CONFIG, normalizeConfig } = windowMock.AuroraLinuxRuntimeInternals;

test("runtime usa versão v86 fixa e recursos HTTPS", () => {
  assert.equal(DEFAULT_CONFIG.version, "0.5.473");
  for (const key of ["scriptUrl", "wasmUrl", "biosUrl", "vgaBiosUrl", "imageUrl"]) {
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

test("runtime rejeita URLs inseguras ou inválidas", () => {
  assert.throws(() => normalizeConfig({ imageUrl: "javascript:alert(1)" }), /HTTPS/);
  assert.throws(() => normalizeConfig({ imageUrl: "http://example.com/linux.iso" }), /HTTPS/);
  assert.throws(() => normalizeConfig({ wasmUrl: "não-é-url" }), /URL inválida/);
});

test("runtime rejeita limites de inicialização inválidos", () => {
  assert.throws(() => normalizeConfig({ startupTimeoutMs: 1000 }), /entre 10 e 180 segundos/);
  assert.throws(() => normalizeConfig({ startupTimeoutMs: 200000 }), /entre 10 e 180 segundos/);
});
