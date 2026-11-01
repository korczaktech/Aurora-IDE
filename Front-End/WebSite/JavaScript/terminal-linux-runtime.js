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
  kernelUrl: "https://i.copy.sh/buildroot-bzimage68.bin",
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
      autostart: true,
      fastboot: true
    });
    this.emulator = emulator;

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
        this.state = "running";
        this.callbacks.onStatus?.("Emulador iniciado · aguardando o console serial");
        finish();
      });
      emulator.add_listener("download-error", error => finish(new Error("Falha ao baixar " + (error?.file_name || "um recurso do Linux") + ". Verifique a conexão e a disponibilidade do CDN.")));
    });
  }

  restart() {
    if (!this.emulator || this.state !== "running") throw new Error("O terminal Linux não está em execução.");
    if (typeof this.emulator.restart !== "function") throw new Error("Esta versão do emulador não oferece reinicialização.");
    this.emulator.restart();
    this.callbacks.onStatus?.("Reiniciando o ambiente Linux…");
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