import { ipcRenderer } from 'electron';

const removeAllListeners = (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
};

const send = (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args);
};

const invoke = (channel: string, ...args: any[]) => {
    return ipcRenderer.invoke(channel, ...args);
};

const on = (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
    ipcRenderer.on(channel, listener);
};

const off = (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
    ipcRenderer.off(channel, listener);
};

export const ipc = {
    invoke,
    off,
    on,
    removeAllListeners,
    send,
};

export type Ipc = typeof ipc;
