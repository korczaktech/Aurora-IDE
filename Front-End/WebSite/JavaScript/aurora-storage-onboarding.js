(() => {
  "use strict";

  const dialog = document.getElementById("auroraAccessDialog");
  const chooseButton = document.getElementById("auroraAccessChoose");
  const laterButton = document.getElementById("auroraAccessLater");
  const locationLabel = document.getElementById("auroraAccessLocation");
  if (!dialog || !chooseButton || !laterButton) return;

  const DB_NAME = "AuroraProjectManager";
  const STORE_NAME = "workspace";
  const STORAGE_KEY = "auroraStorage";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Não foi possível acessar o armazenamento local."));
    });
  }

  async function readStorageHandle() {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STORAGE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async function saveStorageHandle(handle) {
    const db = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(handle, STORAGE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("Não foi possível memorizar o local escolhido."));
        tx.onabort = () => reject(tx.error || new Error("O salvamento do local foi cancelado."));
      });
    } finally {
      db.close();
    }
  }

  async function hasAccess(handle) {
    if (!handle || handle.name !== ".aurora" || typeof handle.queryPermission !== "function") return false;
    return await handle.queryPermission({ mode: "readwrite" }) === "granted";
  }

  async function prepareStorage(locationHandle) {
    const storage = await locationHandle.getDirectoryHandle(".aurora", { create: true });
    const permission = await storage.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new Error("O acesso de leitura e gravação à pasta .aurora não foi autorizado.");
    await storage.getDirectoryHandle("projects", { create: true });
    await storage.getDirectoryHandle("config", { create: true });
    await storage.getDirectoryHandle("workspace", { create: true });
    await saveStorageHandle(storage);
    return storage;
  }

  function setMessage(message) {
    locationLabel.textContent = message;
  }

  async function initialize() {
    if (!window.isSecureContext || !window.showDirectoryPicker) {
      setMessage("O acesso a pastas locais requer Chrome ou Edge atualizado em uma conexão HTTPS. Você ainda pode conhecer o Aurora, mas a criação de projetos locais ficará indisponível neste navegador.");
      chooseButton.disabled = true;
      chooseButton.textContent = "Acesso a pastas indisponível";
      dialog.showModal();
      return;
    }

    try {
      const saved = await readStorageHandle();
      if (saved && await hasAccess(saved)) {
        setMessage("Armazenamento conectado: .aurora. O Aurora já tem permissão para trabalhar dentro dessa pasta.");
        chooseButton.textContent = "Alterar local de armazenamento";
      } else {
        setMessage("Recomendado: escolha a raiz de um disco ou uma pasta principal de armazenamento. O navegador pedirá sua autorização antes de liberar o acesso.");
      }
    } catch (error) {
      console.warn("[Aurora Storage Setup]", error);
      setMessage("Vamos configurar o armazenamento local. Escolha uma pasta principal para criar .aurora.");
    }

    if (!dialog.open) dialog.showModal();
  }

  chooseButton.addEventListener("click", async () => {
    if (!window.showDirectoryPicker) return;
    chooseButton.disabled = true;
    laterButton.disabled = true;
    chooseButton.textContent = "Aguardando autorização…";
    setMessage("Selecione a pasta principal no seletor do navegador. O Aurora criará .aurora dentro dela.");
    try {
      const pickerPromise = window.showDirectoryPicker({ mode: "readwrite" });
      const location = await pickerPromise;
      const storage = await prepareStorage(location);
      setMessage("Configurado com sucesso em " + location.name + "/.aurora. Seus projetos ficarão dentro de .aurora/projects.");
      chooseButton.textContent = "Armazenamento configurado";
      chooseButton.disabled = true;
      laterButton.disabled = false;
      window.dispatchEvent(new CustomEvent("aurora:storage-ready", { detail: { name: storage.name } }));
      window.setTimeout(() => {
        if (dialog.open) dialog.close();
      }, 1100);
    } catch (error) {
      if (error && error.name === "AbortError") {
        setMessage("Seleção cancelada. Você poderá configurar o armazenamento depois.");
      } else {
        setMessage(error && error.message ? error.message : "Não foi possível configurar o armazenamento.");
        console.error("[Aurora Storage Setup]", error);
      }
      chooseButton.disabled = false;
      chooseButton.textContent = "Tentar novamente";
      laterButton.disabled = false;
    }
  });

  laterButton.addEventListener("click", () => dialog.close());
  initialize();
})();
