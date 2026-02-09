import { ipcRenderer } from 'electron';

const exit = () => {
    ipcRenderer.send('window-close');
};

const maximize = () => {
    ipcRenderer.send('window-maximize');
};

const minimize = () => {
    ipcRenderer.send('window-minimize');
};

const unmaximize = () => {
    ipcRenderer.send('window-unmaximize');
};

const quit = () => {
    ipcRenderer.send('window-quit');
};

const devtools = () => {
    ipcRenderer.send('window-dev-tools');
};

const clearCache = (): Promise<void> => {
    return ipcRenderer.invoke('window-clear-cache');
};

const clearCookies = (): Promise<void> => {
    return ipcRenderer.invoke('window-clear-cookies');
};

export const browser = {
    clearCache,
    clearCookies,
    devtools,
    exit,
    maximize,
    minimize,
    quit,
    unmaximize,
};

export type Browser = typeof browser;
