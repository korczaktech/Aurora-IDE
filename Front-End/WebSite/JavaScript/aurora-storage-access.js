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

  window.AuroraStorageAccess = Object.freeze({ requestReadWrite });
})();