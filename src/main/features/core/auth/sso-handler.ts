import { BrowserWindow, ipcMain, session } from 'electron';
import { IPC_EVENTS } from '../../../../shared/constants';
import { getAssetPath } from '../../../paths';

let ssoWindow: BrowserWindow | null = null;

export const openSSOWindow = async (
    url: string,
    sender?: Electron.WebContents,
    flowId?: string,
) => {
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
        if (sender && !sender.isDestroyed()) {
            sender.send(IPC_EVENTS.AUTH_SSO_CLOSED, flowId);
        }
    });

    // Optional: Check for successful redirect if possible,
    // but for now relying on user to close window is safer for generic SSO.
};

ipcMain.on(IPC_EVENTS.AUTH_OPEN_SSO, (event, url: string, flowId?: string) => {
    openSSOWindow(url, event.sender, flowId);
});

ipcMain.on(IPC_EVENTS.AUTH_CLOSE_SSO, () => {
    if (ssoWindow && !ssoWindow.isDestroyed()) {
        ssoWindow.close();
    }
});
