(() => {
  "use strict";

  async function requestReadWrite(handle) {
    if (!handle || typeof handle.queryPermission !== "function") {
      throw new Error("A pasta de armazenamento não está disponível.");
    }
    const options = { mode: "readwrite" };
    let permission = await handle.queryPermission(options);
    if (permission !== "granted") {
      if (typeof handle.requestPermission !== "function") return false;
      permission = await handle.requestPermission(options);
    }
    return permission === "granted";
  }

  async function resolveStorageDirectory(selectedHandle) {
    if (!selectedHandle || typeof selectedHandle.getDirectoryHandle !== "function") {
      throw new Error("Selecione uma pasta válida para o armazenamento Aurora.");
    }
    // O seletor pode devolver a própria .aurora ou a pasta-pai que a contém.
    return selectedHandle.name === ".aurora"
      ? selectedHandle
      : selectedHandle.getDirectoryHandle(".aurora", { create: true });
  }

  window.AuroraStorageAccess = Object.freeze({ requestReadWrite, resolveStorageDirectory });
})();