const { contextBridge, ipcRenderer } = require("electron");

// this is the only bridge the renderer has to the network and the os
contextBridge.exposeInMainWorld("api", {
  platform: process.platform,
  generate: (o) => ipcRenderer.invoke("ai:generate", o),
  savePDF: (o) => ipcRenderer.invoke("pdf:save", o),
  exportFile: (o) => ipcRenderer.invoke("file:export", o),
  importFile: (o) => ipcRenderer.invoke("file:import", o),
  openExternal: (url) => ipcRenderer.send("open:external", url)
});
