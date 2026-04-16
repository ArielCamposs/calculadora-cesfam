const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let listenersBound = false;
let updateReadyToInstall = false;

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function setStatus(message, type = 'info') {
  sendToRenderer('updater-status', { message, type });
}

function checkForUpdates() {
  if (!app.isPackaged) {
    setStatus('Auto-update disponible solo en app instalada (build).', 'info');
    return;
  }

  setStatus('Buscando actualizaciones...', 'info');
  autoUpdater.checkForUpdates().catch((error) => {
    setStatus(`No se pudo buscar actualización: ${error.message}`, 'error');
  });
}

function installDownloadedUpdate() {
  if (!updateReadyToInstall) {
    setStatus('Aún no hay una actualización descargada para instalar.', 'warn');
    return;
  }

  setStatus('Instalando actualización y reiniciando...', 'info');
  autoUpdater.quitAndInstall(false, true);
}

function bindAutoUpdaterListeners() {
  if (listenersBound) return;
  listenersBound = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    setStatus('Buscando actualizaciones...', 'info');
  });

  autoUpdater.on('update-available', (info) => {
    updateReadyToInstall = false;
    setStatus(`Nueva versión encontrada (${info.version}). Descargando...`, 'info');
    autoUpdater.downloadUpdate().catch((error) => {
      setStatus(`No se pudo descargar actualización: ${error.message}`, 'error');
    });
  });

  autoUpdater.on('update-not-available', () => {
    setStatus('Ya estás en la última versión.', 'ok');
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendToRenderer('updater-progress', {
      percent: Number(progressObj.percent || 0),
      transferred: progressObj.transferred || 0,
      total: progressObj.total || 0,
      bytesPerSecond: progressObj.bytesPerSecond || 0
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateReadyToInstall = true;
    sendToRenderer('updater-downloaded', { version: info.version });
    setStatus(`Actualización ${info.version} lista para instalar.`, 'ok');
  });

  autoUpdater.on('error', (error) => {
    setStatus(`Error de actualización: ${error == null ? 'desconocido' : error.message}`, 'error');
  });
}

function initUpdater(win) {
  mainWindow = win;
  bindAutoUpdaterListeners();

  ipcMain.removeAllListeners('check-for-updates');
  ipcMain.removeAllListeners('install-update-now');
  ipcMain.on('check-for-updates', checkForUpdates);
  ipcMain.on('install-update-now', installDownloadedUpdate);

  if (app.isPackaged) {
    setStatus('Auto-update activo. Puedes buscar nuevas versiones.', 'info');
  } else {
    setStatus('Modo desarrollo: auto-update deshabilitado hasta generar instalador.', 'warn');
  }
}

module.exports = {
  initUpdater
};
