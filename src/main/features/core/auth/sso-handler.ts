import { BrowserWindow, ipcMain } from 'electron';

let authWindow: BrowserWindow | null = null;
// Removed top-level mainWindow to avoid circular dependency

export const openSSOWindow = (url: string) => {
    if (authWindow) {
        authWindow.focus();
        return;
    }

    // Fix circular dependency: Don't import getMainWindow from index.ts
    // Instead, find the main window or create independent window
    const mainWindow = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w !== authWindow);

    authWindow = new BrowserWindow({
        alwaysOnTop: true,
        autoHideMenuBar: true,
        height: 800,
        parent: mainWindow || undefined, // Set parent if mainWindow is available
        title: 'SSO Authentication',
        webPreferences: {
            nodeIntegration: false, // Security: Ensure node integration is off
            contextIsolation: true,
            sandbox: true,
            partition: 'persist:main', // Validate if we need a specific partition or share with main
        },
        width: 600,
    });

    authWindow.loadURL(url);

    // Optional: clear cookies if needed before loading
    // session.defaultSession.clearStorageData({ storages: ['cookies'] });

    authWindow.on('closed', () => {
        authWindow = null;
        // Notify renderer that auth window is closed, potentially to retry request
        if (mainWindow && !mainWindow.isDestroyed()) {
             mainWindow.webContents.send('auth-sso-closed');
        }
    });

    // We can also monitor navigation or specific redirects if we want to auto-close 
    // when a certain success URL is reached, but for generic SSO, manual close might be safer 
    // or we teach the user to close it. 
    // For now, relies on user closing the window after auth.
};

export const initSSOHandler = () => {
    ipcMain.on('auth-sso', (_event, url: string) => {
        openSSOWindow(url);
    });
};
