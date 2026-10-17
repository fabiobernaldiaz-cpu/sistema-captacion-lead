/* Puente seguro entre la ventana y el proceso principal: la ventana no
   tiene acceso a Node ni al token, solo a estas funciones. */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function on(channel) {
  return (fn) => {
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld("rn", {
  getSettings: () => ipcRenderer.invoke("rn:get-settings"),
  saveSettings: (patch) => ipcRenderer.invoke("rn:save-settings", patch),
  api: (action, opts) => ipcRenderer.invoke("rn:api", action, opts),
  test: () => ipcRenderer.invoke("rn:test"),
  exportCsv: (type) => ipcRenderer.invoke("rn:export", type),
  openExternal: (url) => ipcRenderer.invoke("rn:open-external", url),
  checkNow: () => ipcRenderer.invoke("rn:check-now"),
  onEvents: on("rn:events"),
  onStatus: on("rn:status"),
  onNavigate: on("rn:navigate"),
});
