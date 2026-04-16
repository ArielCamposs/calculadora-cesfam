const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { initUpdater } = require('./updater');

let closeBlockedByMandatoryUpdate = false;
let allowCloseForUpdateInstall = false;

function createWindow() {
  const win = new BrowserWindow({
    width: 920,
    height: 620,
    minWidth: 800,
    minHeight: 560,
    resizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#EEF1F8',
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  win.on('close', (event) => {
    if (closeBlockedByMandatoryUpdate && !allowCloseForUpdateInstall) {
      event.preventDefault();
      win.webContents.send('force-update-close-blocked');
      return;
    }

    allowCloseForUpdateInstall = false;
  });

  win.loadFile('index.html');
  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  initUpdater(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const activatedWin = createWindow();
      initUpdater(activatedWin);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('window-close', () => {
  BrowserWindow.getFocusedWindow()?.close();
});

ipcMain.on('window-minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize();
});

ipcMain.on('window-toggle-maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.handle('window-is-maximized', () => {
  const win = BrowserWindow.getFocusedWindow();
  return Boolean(win?.isMaximized());
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.on('set-close-blocked-by-update', (_event, blocked) => {
  closeBlockedByMandatoryUpdate = Boolean(blocked);
});

ipcMain.on('allow-close-for-update-install', () => {
  allowCloseForUpdateInstall = true;
  closeBlockedByMandatoryUpdate = false;
});

ipcMain.on('open-devtools', () => {
  BrowserWindow.getFocusedWindow()?.webContents.openDevTools();
});
