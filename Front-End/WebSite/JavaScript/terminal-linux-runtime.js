(() => {
"use strict";

const ASSET_ROOT = (() => {
  try {
    const source = document.currentScript?.src || new URL("../JavaScript/terminal-linux-runtime.js", location.href).href;
    return new URL("../runtime/linux/", source).href;
  } catch (_) {
    return "https://aurora.korczaktech.com.br/runtime/linux/";
  }
})();
const DEFAULT_CONFIG = Object.freeze({
  version: "0.5.473",
  scriptUrl: new URL("v86/libv86.js", ASSET_ROOT).href,
  wasmUrl: new URL("v86/v86.wasm", ASSET_ROOT).href,
  biosUrl: new URL("bios/seabios.bin", ASSET_ROOT).href,
  vgaBiosUrl: new URL("bios/vgabios.bin", ASSET_ROOT).href,
  kernelUrl: "https://raw.githubusercontent.com/alizafarbati/WebLinux/main/images/buildroot-bzimage68.bin",
  memorySize: 128 * 1024 * 1024,
  vgaMemorySize: 8 * 1024 * 1024,
  startupTimeoutMs: 90000
});

let scriptPromise = null;

function normalizeConfig(input = {}) {
  const config = { ...DEFAULT_CONFIG, ...input };
  for (const key of ["scriptUrl", "wasmUrl", "biosUrl", "vgaBiosUrl", "kernelUrl"]) {
    let url;
    try { url = new URL(config[key]); }
    catch (_) { throw new Error("URL inválida para o recurso Linux: " + key); }
    const isLocalDevelopment = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !isLocalDevelopment) {
      throw new Error("O recurso Linux precisa usar HTTPS, exceto em localhost: " + key);
    }
    config[key] = url.href;
  }
  if (!Number.isInteger(config.memorySize) || config.memorySize < 64 * 1024 * 1024 || config.memorySize > 512 * 1024 * 1024) {
    throw new Error("A memória do Linux deve estar entre 64 MB e 512 MB.");
  }
  if (!Number.isInteger(config.vgaMemorySize) || config.vgaMemorySize < 1 * 1024 * 1024 || config.vgaMemorySize > 16 * 1024 * 1024) {
    throw new Error("A memória de vídeo deve estar entre 1 MB e 16 MB.");
  }
  if (!Number.isInteger(config.startupTimeoutMs) || config.startupTimeoutMs < 10000 || config.startupTimeoutMs > 180000) {
    throw new Error("O tempo limite de inicialização deve estar entre 10 e 180 segundos.");
  }
  return Object.freeze(config);
}

function loadV86(scriptUrl) {
  if (typeof window.V86Starter === "function" || typeof window.V86 === "function") return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.auroraV86 = "true";
    script.onload = () => {
      if (typeof window.V86Starter === "function" || typeof window.V86 === "function") resolve();
      else reject(new Error("A biblioteca v86 carregou, mas não disponibilizou V86Starter."));
    };
    script.onerror = () => reject(new Error("Não foi possível carregar o emulador v86. Verifique a conexão e tente novamente."));
    document.head.append(script);
  }).catch(error => {
    scriptPromise = null;
    const failed = document.querySelector('script[data-aurora-v86="true"]');
    failed?.remove();
    throw error;
  });
  return scriptPromise;
}

class AuroraLinuxRuntime {
  constructor(config = {}) {
    this.config = normalizeConfig(config);
    this.emulator = null;
    this.state = "idle";
    this.callbacks = {};
    this.startPromise = null;
    this.cancelRequested = false;
    this.finishBoot = null;
    this.abortController = null;
    this.projectSession = null;
  }

  async start(callbacks = {}) {
    if (this.state === "running") return this;
    if (this.state === "starting" && this.startPromise) return this.startPromise;
    if (this.state === "stopping") throw new Error("Aguarde o encerramento do terminal Linux.");
    if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(location.hostname)) {
      throw new Error("O terminal Linux exige uma origem HTTPS segura.");
    }
    if (typeof WebAssembly === "undefined" || typeof WebAssembly.instantiate !== "function") {
      throw new Error("Este navegador não oferece WebAssembly, necessário para executar o Linux.");
    }

    this.callbacks = callbacks;
    if (!callbacks.consoleContainer || typeof callbacks.consoleContainer.append !== "function") {
      throw new Error("O contêiner do console Linux não foi preparado.");
    }
    if (typeof callbacks.xtermLib !== "function") throw new Error("xterm.js não está disponível para o console Linux.");
    this.cancelRequested = false;
    this.state = "starting";
    this.callbacks.onStatus?.("Carregando o emulador Linux…");
    this.startPromise = this._boot();
    try {
      await this.startPromise;
      return this;
    } catch (error) {
      if (error?.name === "AbortError") {
        this.state = "idle";
      } else {
        const emulator = this.emulator;
        this.emulator = null;
        try {
          if (typeof emulator?.destroy === "function") await emulator.destroy();
          else await Promise.resolve(emulator?.stop?.());
        } catch (_) {}
        this.state = "error";
        this.callbacks.onError?.(error);
      }
      throw error;
    } finally {
      this.startPromise = null;
    }
  }

  async _boot() {
    await loadV86(this.config.scriptUrl);
    if (this.callbacks.projectHandle) {
      const bridge = window.AuroraLinuxProjectBridge;
      if (!bridge) throw new Error("A ponte segura de arquivos do projeto não foi carregada.");
      this.callbacks.onStatus?.("Lendo os arquivos autorizados do projeto…");
      await this.callbacks.flushProject?.();
      this.projectSession = await bridge.createSession(this.callbacks.projectHandle);
    }
    if (this.cancelRequested) throw Object.assign(new Error("Inicialização do Linux cancelada."), { name: "AbortError" });
    if (typeof fetch !== "function" || typeof AbortController !== "function") {
      throw new Error("Este navegador não oferece Fetch e AbortController para carregar o kernel com segurança.");
    }
    this.callbacks.onStatus?.("Baixando kernel Linux…");
    this.abortController = new AbortController();
    let downloadTimedOut = false;
    const downloadTimer = setTimeout(() => {
      downloadTimedOut = true;
      this.abortController?.abort();
    }, this.config.startupTimeoutMs);
    let kernelBuffer;
    try {
      const response = await fetch(this.config.kernelUrl, {
        mode: "cors",
        credentials: "omit",
        signal: this.abortController.signal
      });
      if (!response.ok) throw new Error("O servidor do kernel respondeu HTTP " + response.status + ".");
      kernelBuffer = await response.arrayBuffer();
      if (!kernelBuffer.byteLength) throw new Error("O arquivo do kernel Linux está vazio.");
    } catch (error) {
      if (this.cancelRequested) throw Object.assign(new Error("Inicialização do Linux cancelada."), { name: "AbortError" });
      if (downloadTimedOut) throw new Error("O download do kernel Linux excedeu o tempo limite.");
      throw error;
    } finally {
      clearTimeout(downloadTimer);
      this.abortController = null;
    }
    if (this.cancelRequested) throw Object.assign(new Error("Inicialização do Linux cancelada."), { name: "AbortError" });
    const Starter = window.V86Starter || window.V86;
    if (typeof Starter !== "function") throw new Error("A API do emulador v86 não está disponível.");

    const emulator = new Starter({
      wasm_path: this.config.wasmUrl,
      memory_size: this.config.memorySize,
      vga_memory_size: this.config.vgaMemorySize,
      bios: { url: this.config.biosUrl },
      vga_bios: { url: this.config.vgaBiosUrl },
      bzimage: { buffer: kernelBuffer },
      filesystem: {},
      cmdline: "tsc=reliable mitigations=off random.trust_cpu=on",
      disable_keyboard: true,
      serial_console: {
        type: "xtermjs",
        container: this.callbacks.consoleContainer,
        xterm_lib: this.callbacks.xtermLib
      },
      autostart: false,
      fastboot: true
    });
    this.emulator = emulator;
    if (this.projectSession) {
      if (!emulator.fs9p) throw new Error("O emulador não disponibilizou o filesystem 9p.");
      this.callbacks.onStatus?.("Preparando os arquivos do projeto no Linux…");
      const seeded = await window.AuroraLinuxProjectBridge.seedFilesystem(emulator.fs9p, this.projectSession.snapshot);
      this.projectSession.seeded = true;
      this.callbacks.onProjectPrepared?.(seeded);
    }

    emulator.add_listener("download-progress", progress => {
      const loaded = Number(progress?.loaded) || 0;
      const total = Number(progress?.total) || 0;
      if (total > 0) this.callbacks.onStatus?.("Baixando ambiente Linux… " + Math.floor(loaded / total * 100) + "%");
    });


    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.finishBoot = null;
        if (error) reject(error);
        else resolve();
      };
      this.finishBoot = finish;
      const timeout = setTimeout(() => finish(new Error("O emulador Linux não ficou pronto dentro do tempo esperado.")), this.config.startupTimeoutMs);
      emulator.add_listener("emulator-ready", () => {
        if (settled) return;
        this.callbacks.onStatus?.("Emulador pronto · iniciando o sistema Linux");
        finish();
      });
      emulator.add_listener("download-error", error => finish(new Error("Falha ao baixar " + (error?.file_name || "um recurso do Linux") + ". Verifique a conexão e a disponibilidade do CDN.")));
    });

    const promptReady = this.projectSession ? this._waitForSerialText(/(?:~% |# )/, this.config.startupTimeoutMs) : null;
    if (typeof emulator.run === "function") await emulator.run();
    else throw new Error("O emulador não oferece o método de inicialização.");
    if (promptReady) {
      await promptReady;
      await this._mountProject();
    }
    this.state = "running";
    const skippedCount = this.projectSession?.snapshot?.skipped?.length || 0;
    this.callbacks.onStatus?.(this.projectSession ? "Linux iniciado · projeto em /workspace" + (skippedCount ? " · " + skippedCount + " item(ns) ignorados por limite" : "") : "Linux iniciado");
  }

  _waitForSerialText(pattern, timeoutMs) {
    const emulator = this.emulator;
    if (!emulator || typeof emulator.add_listener !== "function") {
      return Promise.reject(new Error("O console serial não oferece eventos para detectar o shell."));
    }
    return new Promise((resolve, reject) => {
      let output = "";
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        emulator.remove_listener?.("serial0-output-byte", listener);
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(output);
      };
      const listener = data => {
        if (typeof data === "number") output += String.fromCharCode(data & 255);
        else if (typeof data === "string") output += data;
        else if (data && typeof data.length === "number") {
          for (let index = 0; index < data.length; index++) output += String.fromCharCode(data[index] & 255);
        }
        if (output.length > 8192) output = output.slice(-4096);
        if (pattern.test(output)) finish();
      };
      const timer = setTimeout(() => finish(new Error("O shell Linux não respondeu dentro do tempo esperado.")), timeoutMs);
      emulator.add_listener("serial0-output-byte", listener);
    });
  }

  async _mountProject() {
    if (!this.projectSession) return;
    const emulator = this.emulator;
    if (typeof emulator?.serial0_send !== "function") {
      throw new Error("O console serial não permite preparar o workspace Linux.");
    }
    this.callbacks.onStatus?.("Montando o projeto em /workspace…");
    const marker = "__AURORA_WORKSPACE_READY__";
    const failed = "__AURORA_WORKSPACE_FAILED__";
    const result = this._waitForSerialText(new RegExp(marker + "|" + failed), 20000);
    emulator.serial0_send("mkdir -p /workspace && mount -t 9p -o trans=virtio,version=9p2000.L host9p /workspace && cd /workspace && echo " + marker + " || echo " + failed + "\n");
    const output = await result;
    if (output.includes(failed)) {
      throw new Error("O kernel não conseguiu montar o projeto via 9p. O workspace não foi disponibilizado ao Linux.");
    }
  }

  async syncProject() {
    if (this.state !== "running" || !this.emulator) {
      throw new Error("Inicie o ambiente Linux antes de sincronizar os arquivos.");
    }
    if (!this.projectSession) throw new Error("Esta sessão Linux não está vinculada a um projeto.");
    this.callbacks.onStatus?.("Sincronizando alterações do Linux para o projeto…");
    await this.callbacks.flushProject?.();
    const result = await window.AuroraLinuxProjectBridge.syncToProject(this.emulator.fs9p, this.projectSession);
    await this.callbacks.refreshProject?.();
    this.callbacks.onStatus?.("Sincronização concluída · " + result.written + " arquivo(s) atualizado(s)");
    return result;
  }

  async restart() {
    if (!this.emulator || this.state !== "running") throw new Error("O terminal Linux não está em execução.");
    if (typeof this.emulator.restart !== "function") throw new Error("Esta versão do emulador não oferece reinicialização.");
    this.state = "starting";
    this.callbacks.onStatus?.("Reiniciando o ambiente Linux…");
    try {
      const promptReady = this._waitForSerialText(/(?:~% |# )/, this.config.startupTimeoutMs);
      this.emulator.restart();
      await promptReady;
      if (this.projectSession) await this._mountProject();
      this.state = "running";
      this.callbacks.onStatus?.(this.projectSession ? "Linux reiniciado · projeto montado em /workspace" : "Linux reiniciado");
      return this;
    } catch (error) {
      this.state = "error";
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  async stop() {
    this.cancelRequested = true;
    this.state = "stopping";
    this.abortController?.abort();
    this.finishBoot?.(Object.assign(new Error("Inicialização do Linux cancelada."), { name: "AbortError" }));
    const emulator = this.emulator;
    this.emulator = null;
    if (!emulator) {
      this.state = "idle";
      return;
    }
    try {
      if (typeof emulator.destroy === "function") await emulator.destroy();
      else await Promise.resolve(emulator.stop?.());
      this.state = "idle";
      this.callbacks.onStatus?.("Terminal Linux encerrado");
    } catch (error) {
      this.state = "error";
      throw error;
    }
  }
}

window.AuroraLinuxRuntime = AuroraLinuxRuntime;
window.AuroraLinuxRuntimeInternals = Object.freeze({
  DEFAULT_CONFIG,
  normalizeConfig
});
})();