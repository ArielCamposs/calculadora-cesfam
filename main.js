const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('node:fs/promises');
const { initUpdater } = require('./updater');
const APP_ICON_PATH = path.join(__dirname, 'assets', 'logo-insulina-ico.ico');
const APP_USER_MODEL_ID = 'com.ariel.calculadorafarmacia';

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
    icon: APP_ICON_PATH
  });
  win.setIcon(APP_ICON_PATH);

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
  app.setAppUserModelId(APP_USER_MODEL_ID);
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
ipcMain.handle('patients-read', async () => {
  const baseDir = app.getPath('userData');
  const primaryPath = path.join(baseDir, 'pacientes.json');
  const backupPath = path.join(baseDir, 'pacientes.backup.json');

  const readPatientsFile = async (filePath) => {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  };

  try {
    return await readPatientsFile(primaryPath);
  } catch {
    try {
      return await readPatientsFile(backupPath);
    } catch {
      return [];
    }
  }
});

ipcMain.handle('patients-write', async (_event, payload) => {
  const baseDir = app.getPath('userData');
  const primaryPath = path.join(baseDir, 'pacientes.json');
  const backupPath = path.join(baseDir, 'pacientes.backup.json');
  const tmpPath = `${primaryPath}.tmp`;
  const data = JSON.stringify(Array.isArray(payload) ? payload : [], null, 2);

  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(tmpPath, data, 'utf8');
  await fs.rename(tmpPath, primaryPath);
  await fs.writeFile(backupPath, data, 'utf8');
  return true;
});

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
