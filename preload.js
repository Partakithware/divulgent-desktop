// preload.js
const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {

  const patchAll = () => {
    const videos = document.querySelectorAll('video');
    videos.forEach(patchVideo);
  };

  const observer = new MutationObserver(patchAll);
  observer.observe(document, { childList: true, subtree: true });

  patchAll();
});

contextBridge.exposeInMainWorld('electronAPI', {
    // Request desktop icons from main process
    getDesktopIcons: () => ipcRenderer.send('desktop-icons-request'),
    // Listen for updates to desktop icons from main process
    onDesktopIconsUpdate: (callback) => ipcRenderer.on('desktop-icons-update', (event, icons) => callback(icons)),
    // Send command to launch an app
    launchApp: (appPath) => ipcRenderer.send('launch-app', appPath),
        // --- ADD THESE TWO NEW LINES ---
    showIconContextMenu: (iconData) => ipcRenderer.send('show-icon-context-menu', iconData),
    onUpdateIconSrc: (callback) => ipcRenderer.on('update-icon-src', callback),
});