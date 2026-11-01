(() => {
"use strict";

const DEFAULT_CONFIG = Object.freeze({
  version: "0.5.473",
  scriptUrl: "https://cdn.jsdelivr.net/npm/v86@0.5.473/build/libv86.js",
  wasmUrl: "https://cdn.jsdelivr.net/npm/v86@0.5.473/build/v86.wasm",
  biosUrl: "https://copy.sh/v86/bios/seabios.bin",
  vgaBiosUrl: "https://copy.sh/v86/bios/vgabios.bin",
  imageUrl: "https://copy.sh/v86/images/linux.iso",
  memorySize: 128 * 1024 * 1024,
  vgaMemorySize: 8 * 1024 * 1024,
  startupTimeoutMs: 90000
});

let scriptPromise = null;

function normalizeConfig(input = {}) {
  const config = { ...DEFAULT_CONFIG, ...input };
  for (const key of ["scriptUrl", "wasmUrl", "biosUrl", "vgaBiosUrl", "imageUrl"]) {
    let url;
    try { url = new URL(config[key]); }
    catch (_) { throw new Error("URL inválida para o recurso Linux: " + key); }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("O recurso Linux precisa usar HTTP ou HTTPS: " + key);
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
    this.decoder = new TextDecoder("utf-8");
    this.callbacks = {};
    this.startPromise = null;
    this.cancelRequested = false;
    this.finishBoot = null;
  }

  async start(callbacks = {}) {
    if (this.state === "running") return this;
    if (this.state === "starting" && this.startPromise) return this.startPromise;
    if (this.state === "stopping") throw new Error("Aguarde o encerramento do terminal Linux.");
    if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(location.hostname)) {
      throw new Error("O terminal Linux exige uma origem HTTPS segura.");
    }

    this.callbacks = callbacks;
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
        try { await Promise.resolve(emulator?.stop?.()); } catch (_) {}
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
    const Starter = window.V86Starter || window.V86;
    if (typeof Starter !== "function") throw new Error("A API do emulador v86 não está disponível.");

    const emulator = new Starter({
      wasm_path: this.config.wasmUrl,
      memory_size: this.config.memorySize,
      vga_memory_size: this.config.vgaMemorySize,
      bios: { url: this.config.biosUrl },
      vga_bios: { url: this.config.vgaBiosUrl },
      cdrom: { url: this.config.imageUrl },
      autostart: true
    });
    this.emulator = emulator;

    emulator.add_listener("download-progress", progress => {
      const loaded = Number(progress?.loaded) || 0;
      const total = Number(progress?.total) || 0;
      if (total > 0) this.callbacks.onStatus?.("Baixando ambiente Linux… " + Math.floor(loaded / total * 100) + "%");
    });
    emulator.add_listener("serial0-output-byte", byte => {
      const value = Number(byte);
      if (!Number.isFinite(value)) return;
      const decoded = this.decoder.decode(Uint8Array.of(value & 255), { stream: true });
      if (decoded) this.callbacks.onOutput?.(decoded);
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
      emulator.add_listener("emulator-error", error => finish(new Error(String(error || "Falha interna do emulador v86."))));
    });
  }

  send(data) {
    if (!this.emulator || (this.state !== "running" && this.state !== "starting")) return false;
    if (typeof this.emulator.serial0_send !== "function") {
      throw new Error("O console serial não está disponível nesta versão do emulador.");
    }
    this.emulator.serial0_send(String(data));
    return true;
  }

  async stop() {
    this.cancelRequested = true;
    this.state = "stopping";
    this.finishBoot?.(Object.assign(new Error("Inicialização do Linux cancelada."), { name: "AbortError" }));
    const emulator = this.emulator;
    this.emulator = null;
    if (!emulator) {
      this.state = "idle";
      return;
    }
    try {
      await Promise.resolve(emulator.stop?.());
      this.decoder = new TextDecoder("utf-8");
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