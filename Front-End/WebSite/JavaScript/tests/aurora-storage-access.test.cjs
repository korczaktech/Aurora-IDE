const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "aurora-storage-access.js"), "utf8");
const windowMock = {};
vm.runInNewContext(source, { window: windowMock, Object, Error });
const access = windowMock.AuroraStorageAccess;

test("mantém a conexão quando a permissão já está concedida", async () => {
  let requested = false;
  const handle = {
    async queryPermission() { return "granted"; },
    async requestPermission() { requested = true; return "granted"; }
  };
  assert.equal(await access.requestReadWrite(handle), true);
  assert.equal(requested, false);
});

test("renova a permissão de leitura e gravação quando o navegador retorna prompt", async () => {
  const calls = [];
  const handle = {
    async queryPermission(options) { calls.push(["query", options.mode]); return "prompt"; },
    async requestPermission(options) { calls.push(["request", options.mode]); return "granted"; }
  };
  assert.equal(await access.requestReadWrite(handle), true);
  assert.deepEqual(calls, [["query", "readwrite"], ["request", "readwrite"]]);
});

test("não considera uma permissão negada como conexão", async () => {
  const handle = {
    async queryPermission() { return "prompt"; },
    async requestPermission() { return "denied"; }
  };
  assert.equal(await access.requestReadWrite(handle), false);
});

test("informa quando o handle salvo não está disponível", async () => {
  await assert.rejects(access.requestReadWrite(null), /não está disponível/);
});
