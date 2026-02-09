import { BrowserWindow, ipcMain, session } from 'electron';
import { getAssetPath } from '../../../paths';

let ssoWindow: BrowserWindow | null = null;

export const openSSOWindow = async (url: string) => {
    if (ssoWindow && !ssoWindow.isDestroyed()) {
        ssoWindow.focus();
        ssoWindow.loadURL(url);
        return;
    }

    ssoWindow = new BrowserWindow({
        autoHideMenuBar: true,
        height: 800,
        icon: getAssetPath('icons/icon.png'),
        title: 'SSO Login',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            // Share the default session to persist cookies
            session: session.defaultSession,
        },
        width: 600,
    });

    ssoWindow.loadURL(url);

    // Clear the reference when window is closed
    ssoWindow.on('closed', () => {
        ssoWindow = null;
        // Notify renderer that the SSO window has closed
        // The renderer can then try to re-authenticate or check connectivity
        // modifying this to send to all windows or the main window
        const { getMainWindow } = require('../../../index');
        const mainWindow = getMainWindow();
        if (mainWindow) {
            mainWindow.webContents.send('auth:sso-closed');
        }
    });

    // Optional: Check for successful redirect if possible, 
    // but for now relying on user to close window is safer for generic SSO.
};

ipcMain.on('auth:open-sso', (_event, url: string) => {
    openSSOWindow(url);
});
