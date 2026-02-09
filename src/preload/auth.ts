import { ipcRenderer } from 'electron';

export const auth = {
    onSSOClosed: (callback: () => void) => {
        ipcRenderer.on('auth-sso-closed', callback);
        return () => {
            ipcRenderer.removeListener('auth-sso-closed', callback);
        };
    },
    openSSOWindow: (url: string) => ipcRenderer.send('auth-sso', url),
};
