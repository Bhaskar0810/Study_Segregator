const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1150,
        height: 780,
        minWidth: 850,
        minHeight: 600,
        titleBarStyle: 'default',
        backgroundColor: '#0c0d12',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');
}

// IPC Handlers for native file dialogs and shell
ipcMain.handle('dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Select Files to Segregate',
        properties: ['openFile', 'multiSelections']
    });
    return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:selectDirectory', async (event, currentPath) => {
    const result = await dialog.showOpenDialog({
        title: 'Select Base Storage Folder',
        defaultPath: currentPath || undefined,
        properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('shell:openPath', async (event, fullPath) => {
    return await shell.openPath(fullPath);
});

ipcMain.handle('shell:showItemInFolder', async (event, fullPath) => {
    shell.showItemInFolder(fullPath);
    return true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});