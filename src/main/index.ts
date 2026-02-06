import { is } from '@electron-toolkit/utils';
import {
    app,
    BrowserWindow,
    BrowserWindowConstructorOptions,
    globalShortcut,
    ipcMain,
    Menu,
    nativeImage,
    nativeTheme,
    net,
    powerSaveBlocker,
    protocol,
    Rectangle,
    screen,
    shell,
    Tray,
} from 'electron';
import electronLocalShortcut from 'electron-localshortcut';
import log from 'electron-log/main';
import { AppImageUpdater, autoUpdater, MacUpdater, NsisUpdater } from 'electron-updater';
import { access, constants } from 'fs';
import path, { join } from 'path';

import packageJson from '../../package.json';
import { disableMediaKeys, enableMediaKeys } from './features/core/player/media-keys';
import { shutdownServer } from './features/core/remote';
import { store } from './features/core/settings';
import MenuBuilder from './menu';
import {
    autoUpdaterLogInterface,
    createLog,
    disableAutoUpdates,
    hotkeyToElectronAccelerator,
    isLinux,
    isMacOS,
    isWindows,
} from './utils';
import './features';

import { PlayerType, TitleTheme } from '/@/shared/types/types';

const ALPHA_UPDATER_CONFIG: {
    bucket: string;
    channel: string;
    endpoint: string;
    provider: 's3';
} = {
    bucket: '',
    channel: 'alpha',
    endpoint: 'https://feishin-nightly-bucket.jeffvli.org',
    provider: 's3',
};

type UpdaterInstance = AppImageUpdater | MacUpdater | NsisUpdater | typeof autoUpdater;

class AlphaAppUpdater {
    constructor() {
        const updater = createAlphaUpdaterInstance();
        log.transports.file.level = 'info';
        updater.logger = autoUpdaterLogInterface;
        updater.channel = ALPHA_UPDATER_CONFIG.channel;
        updater.allowPrerelease = true;
        updater.disableDifferentialDownload = true;
        updater.allowDowngrade = true;
        updater.autoInstallOnAppQuit = true;
        updater.autoRunAppAfterInstall = true;
        updater.checkForUpdatesAndNotify();
    }
}

class AppUpdater {
    constructor() {
        const effectiveChannel = store.get('release_channel') as string;
        console.log('Effective update channel:', effectiveChannel);
        if (effectiveChannel === 'alpha') {
            return new AlphaAppUpdater();
        }

        configureAndGetUpdater();
        autoUpdater.checkForUpdatesAndNotify();
    }
}

function configureAndGetUpdater(): UpdaterInstance {
    const isBetaVersion = packageJson.version.includes('-beta');
    const isAlphaVersion = packageJson.version.includes('-alpha');
    let releaseChannel = store.get('release_channel');
    const isNotConfigured = !releaseChannel;

    console.log('Release channel:', releaseChannel);
    console.log('Is beta version:', isBetaVersion);
    console.log('Is alpha version:', isAlphaVersion);
    console.log('Is not configured:', isNotConfigured);

    if (isNotConfigured) {
        console.log('Release channel not configured, setting default channel');
        const defaultChannel = isAlphaVersion ? 'alpha' : isBetaVersion ? 'beta' : 'latest';
        store.set('release_channel', defaultChannel);
        releaseChannel = defaultChannel;
    }

    const effectiveChannel = store.get('release_channel') as string;

    if (effectiveChannel === 'alpha') {
        const updater = createAlphaUpdaterInstance();
        log.transports.file.level = 'info';
        updater.logger = autoUpdaterLogInterface;
        updater.channel = ALPHA_UPDATER_CONFIG.channel;
        updater.allowPrerelease = true;
        updater.disableDifferentialDownload = true;
        updater.allowDowngrade = true;
        updater.autoInstallOnAppQuit = true;
        updater.autoRunAppAfterInstall = true;
        return updater;
    }

    log.transports.file.level = 'info';
    autoUpdater.logger = autoUpdaterLogInterface;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.autoRunAppAfterInstall = true;

    if (effectiveChannel === 'beta') {
        autoUpdater.channel = 'beta';
        autoUpdater.allowPrerelease = true;
        autoUpdater.disableDifferentialDownload = true;
    } else {
        autoUpdater.channel = 'latest';
        autoUpdater.allowDowngrade = true;
        autoUpdater.allowPrerelease = false;
    }

    return autoUpdater;
}

function createAlphaUpdaterInstance(): AppImageUpdater | MacUpdater | NsisUpdater {
    if (isMacOS()) {
        return new MacUpdater(ALPHA_UPDATER_CONFIG);
    }

    if (isLinux()) {
        return new AppImageUpdater(ALPHA_UPDATER_CONFIG);
    }

    return new NsisUpdater(ALPHA_UPDATER_CONFIG);
}

protocol.registerSchemesAsPrivileged([{ privileges: { bypassCSP: true }, scheme: 'feishin' }]);

process.on('uncaughtException', (error: any) => {
    console.error('Error in main process', error);
});

if (store.get('ignore_ssl')) {
    app.commandLine.appendSwitch('ignore-certificate-errors');
}

// From https://github.com/tutao/tutanota/commit/92c6ed27625fcf367f0fbcc755d83d7ff8fde94b
if (isLinux() && !process.argv.some((a) => a.startsWith('--password-store='))) {
    const passwordStore = store.get('password_store', 'gnome-libsecret') as string;
    app.commandLine.appendSwitch('password-store', passwordStore);
}

let mainWindow: BrowserWindow | null = null;
let tray: null | Tray = null;
let exitFromTray = false;
let forceQuit = false;
let powerSaveBlockerId: null | number = null;

if (process.env.NODE_ENV === 'production') {
    import('source-map-support').then((sourceMapSupport) => {
        sourceMapSupport.install();
    });
}

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDevelopment) {
    import('electron-debug').then((electronDebug) => {
        electronDebug.default();
    });
}

const installExtensions = async () => {
    import('electron-devtools-installer').then((installer) => {
        const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
        const extensions = ['REACT_DEVELOPER_TOOLS', 'REDUX_DEVTOOLS'];

        installer
            .installExtension(
                extensions.map((name) => installer[name]),
                { forceDownload },
            )
            .then((installedExtensions) => {
                createLog({
                    message: `Installed extension: ${installedExtensions}`,
                    type: 'info',
                });
            })
            .catch(() => {
                // Ignore
            });
    });
};

const userDataPath = app.getPath('userData');

if (isDevelopment) {
    const devUserDataPath = `${userDataPath}-dev`;
    app.setPath('userData', devUserDataPath);
}

const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
};

const createAuthWindow = (url: string) => {
    // Note: Web security is maintained in development mode for security reasons.
    // CORS issues in development should be handled through the 'ignore_cors' setting
    // rather than blanket disabling web security, which prevents XSS and CSRF attacks.
    const authWindow = new BrowserWindow({
        autoHideMenuBar: true,
        height: 700,
        parent: mainWindow || undefined,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: !store.get('ignore_cors'),
        },
        width: 900,
    });

    authWindow.loadURL(url);

    // Handle load failures (server unreachable, network issues, etc.)
    authWindow.webContents.on(
        'did-fail-load',
        (_event, errorCode, errorDescription, validatedURL) => {
            console.error('Auth window failed to load:', {
                errorCode,
                errorDescription,
                url: validatedURL,
            });

            // Common network error codes that indicate server is unreachable
            const networkErrorCodes = [
                -2, // NAME_NOT_RESOLVED
                -106, // INTERNET_DISCONNECTED
                -102, // CONNECTION_REFUSED
                -21, // NETWORK_CHANGED
                -100, // CONNECTION_CLOSED
                -105, // NAME_RESOLUTION_FAILED
            ];

            if (networkErrorCodes.includes(errorCode)) {
                // Server appears to be unreachable, notify renderer to redirect to server selection
                getMainWindow()?.webContents.send('auth-failed', {
                    errorDescription,
                    reason: 'server_unreachable',
                });

                // Close the auth window after a short delay
                setTimeout(() => {
                    if (!authWindow.isDestroyed()) {
                        authWindow.close();
                    }
                }, 1000);
            }
        },
    );

    // Close auth window when navigation to main domain happens (login success)
    authWindow.webContents.on('did-navigate', (_, navigationUrl) => {
        try {
            const urlObj = new URL(url);
            const mainDomain = urlObj.hostname;
            const navDomain = new URL(navigationUrl).hostname;

            console.log('Navigation detected:', {
                isMainDomain: navDomain === mainDomain,
                mainDomain,
                navDomain,
                navigationUrl,
            });

            // Check if we've returned to the main server domain after OAuth
            // Be more permissive about what constitutes successful auth
            if (
                navDomain === mainDomain &&
                !navigationUrl.includes('/auth/') &&
                !navigationUrl.includes('/login') &&
                !navigationUrl.includes('/signin') &&
                !navigationUrl.includes('/oauth/authorize') && // Allow OAuth callback URLs
                (navigationUrl.includes('dashboard') ||
                    navigationUrl.includes('home') ||
                    navigationUrl.includes('success') ||
                    navigationUrl.includes('/app') ||
                    navigationUrl.includes('/main') ||
                    navigationUrl.includes('?authenticated=true') ||
                    navigationUrl.includes('#authenticated') ||
                    navigationUrl.includes('oauth/callback') ||
                    navigationUrl.includes('auth/callback') ||
                    // Allow any path that's not clearly an auth page after returning to main domain
                    (navigationUrl !== url &&
                        navigationUrl !== url + '/' &&
                        !navigationUrl.endsWith('/login') &&
                        !navigationUrl.endsWith('/signin')))
            ) {
                console.log('Detected successful auth navigation, sending auth-success');

                // Notify renderer that auth was successful
                getMainWindow()?.webContents.send('auth-success');

                // Use a shorter delay to allow the success page to briefly display
                setTimeout(() => {
                    if (!authWindow.isDestroyed()) {
                        authWindow.close();
                    }
                }, 500);
            }
        } catch (e) {
            // Ignore URL parsing errors
            console.error('Error in did-navigate handler:', e);
        }
    });

    // Also listen for when the page finishes loading to detect successful auth
    authWindow.webContents.on('did-finish-load', () => {
        try {
            const currentUrl = authWindow.webContents.getURL();
            const urlObj = new URL(url);
            const mainDomain = urlObj.hostname;
            const currentDomain = new URL(currentUrl).hostname;

            console.log('did-finish-load', {
                currentDomain,
                currentUrl,
                mainDomain,
                urlObj,
            });

            // Simplified page analysis - focus on essential checks only
            authWindow.webContents
                .executeJavaScript(
                    `
                (function() {
                    const title = document.title.toLowerCase();
                    const bodyText = document.body.innerText.toLowerCase();
                    const currentUrl = window.location.href.toLowerCase();
                    
                    // Focus on core indicators rather than extensive heuristics
                    const hasError = bodyText.includes('error') || title.includes('error') ||
                                   bodyText.includes('502 bad gateway') || bodyText.includes('503 service unavailable') ||
                                   bodyText.includes('connection refused');
                    
                    const hasAuth = currentUrl.includes('/dashboard') || currentUrl.includes('/app') ||
                                  bodyText.includes('dashboard') || bodyText.includes('music') ||
                                  bodyText.includes('library');
                    
                    return {
                        hasError,
                        hasAuth,
                        title: document.title,
                        url: currentUrl
                    };
                })();
            `,
                )
                .then((pageInfo: any) => {
                    // If the page has errors, treat as auth failure
                    if (pageInfo.hasError) {
                        getMainWindow()?.webContents.send('auth-failed', {
                            errorDescription: `Server error detected: ${pageInfo.title}`,
                            reason: 'server_error',
                        });

                        setTimeout(() => {
                            if (!authWindow.isDestroyed()) {
                                authWindow.close();
                            }
                        }, 1000);
                        return;
                    }

                    // Check if we're on a success page or dashboard after auth
                    if (currentDomain === mainDomain && pageInfo.hasAuth) {
                        // Notify renderer that auth was successful
                        getMainWindow()?.webContents.send('auth-success');

                        setTimeout(() => {
                            if (!authWindow.isDestroyed()) {
                                authWindow.close();
                            }
                        }, 300);
                    }
                });
        } catch (e) {
            console.error('Error in did-finish-load handler:', e);
        }
    });

    return authWindow;
};

export const getMainWindow = () => {
    return mainWindow;
};

export const sendToastToRenderer = ({
    message,
    type,
}: {
    message: string;
    type: 'error' | 'info' | 'success' | 'warning';
}) => {
    getMainWindow()?.webContents.send('toast-from-main', {
        message,
        type,
    });
};

const createWinThumbarButtons = () => {
    if (isWindows()) {
        getMainWindow()?.setThumbarButtons([
            {
                click: () => getMainWindow()?.webContents.send('renderer-player-previous'),
                icon: nativeImage.createFromPath(getAssetPath('skip-previous.png')),
                tooltip: 'Previous Track',
            },
            {
                click: () => getMainWindow()?.webContents.send('renderer-player-play-pause'),
                icon: nativeImage.createFromPath(getAssetPath('play-circle.png')),
                tooltip: 'Play/Pause',
            },
            {
                click: () => getMainWindow()?.webContents.send('renderer-player-next'),
                icon: nativeImage.createFromPath(getAssetPath('skip-next.png')),
                tooltip: 'Next Track',
            },
        ]);
    }
};

const createTray = () => {
    let trayIcon: Electron.NativeImage | string;

    if (isMacOS()) {
        const iconPath = getAssetPath('icons/IconTemplate.png');
        const icon = nativeImage.createFromPath(iconPath);
        icon.setTemplateImage(true);
        trayIcon = icon;
    } else if (isLinux()) {
        trayIcon = getAssetPath('icons/icon.png');
    } else {
        trayIcon = getAssetPath('icons/icon.ico');
    }

    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            click: () => {
                getMainWindow()?.webContents.send('renderer-player-play-pause');
            },
            label: 'Play/Pause',
        },
        {
            click: () => {
                getMainWindow()?.webContents.send('renderer-player-next');
            },
            label: 'Next Track',
        },
        {
            click: () => {
                getMainWindow()?.webContents.send('renderer-player-previous');
            },
            label: 'Previous Track',
        },
        {
            click: () => {
                getMainWindow()?.webContents.send('renderer-player-stop');
            },
            label: 'Stop',
        },
        {
            type: 'separator',
        },
        {
            click: () => {
                mainWindow?.show();
                createWinThumbarButtons();
            },
            label: 'Open main window',
        },
        {
            click: () => {
                exitFromTray = true;
                app.quit();
            },
            label: 'Quit',
        },
    ]);

    tray.on('click', () => {
        mainWindow?.show();
        createWinThumbarButtons();
    });

    tray.setToolTip('Feishin');
    tray.setContextMenu(contextMenu);
};

async function createWindow(first = true): Promise<void> {
    if (isDevelopment) {
        await installExtensions().catch(console.log);
    }

    const nativeFrame = store.get('window_window_bar_style', 'linux') === 'linux';
    store.set('window_has_frame', nativeFrame);

    const nativeFrameConfig: Record<string, BrowserWindowConstructorOptions> = {
        linux: {
            autoHideMenuBar: true,
            frame: true,
        },
        macOS: {
            autoHideMenuBar: true,
            frame: true,
            titleBarStyle: 'default',
            trafficLightPosition: { x: 10, y: 10 },
        },
        windows: {
            autoHideMenuBar: true,
            frame: true,
        },
    };

    // Create the browser window.
    mainWindow = new BrowserWindow({
        autoHideMenuBar: true,
        frame: false,
        height: 900,
        icon: isWindows() ? getAssetPath('icons/icon.ico') : getAssetPath('icons/icon.png'),
        minHeight: 120,
        minWidth: 480,
        show: false,
        webPreferences: {
            allowRunningInsecureContent: !!store.get('ignore_ssl'),
            backgroundThrottling: false,
            contextIsolation: true,
            devTools: true,
            nodeIntegration: true,
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            webSecurity: !store.get('ignore_cors'),
        },
        width: 1440,
        ...(nativeFrame && isLinux() && nativeFrameConfig.linux),
        ...(nativeFrame && isMacOS() && nativeFrameConfig.macOS),
        ...(nativeFrame && isWindows() && nativeFrameConfig.windows),
    });

    // Handle window.open calls for cookie authentication
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // For authentication URLs, open in a new BrowserWindow within Electron
        // This allows cookie sharing between the auth window and main app
        createAuthWindow(url);
        return { action: 'deny' }; // Prevent default window.open behavior
    });

    // From https://github.com/electron/electron/issues/526#issuecomment-1663959513
    const bounds = store.get('bounds') as Rectangle | undefined;
    if (bounds) {
        const screenArea = screen.getDisplayMatching(bounds).workArea;
        if (
            bounds.x > screenArea.x + screenArea.width ||
            bounds.x < screenArea.x ||
            bounds.y < screenArea.y ||
            bounds.y > screenArea.y + screenArea.height
        ) {
            if (bounds.width < screenArea.width && bounds.height < screenArea.height) {
                mainWindow.setBounds({ height: bounds.height, width: bounds.width });
            } else {
                mainWindow.setBounds({ height: 900, width: 1440 });
            }
        } else {
            mainWindow.setBounds(bounds);
        }
    }

    electronLocalShortcut.register(mainWindow, 'Ctrl+Shift+I', () => {
        mainWindow?.webContents.openDevTools();
    });

    ipcMain.on('window-dev-tools', () => {
        mainWindow?.webContents.openDevTools();
    });

    ipcMain.on('window-maximize', () => {
        mainWindow?.maximize();
    });

    ipcMain.on('window-unmaximize', () => {
        mainWindow?.unmaximize();
    });

    ipcMain.on('window-minimize', () => {
        mainWindow?.minimize();
    });

    ipcMain.on('window-close', () => {
        mainWindow?.close();
    });

    ipcMain.on('window-quit', () => {
        shutdownServer();
        mainWindow?.close();
        app.exit();
    });

    ipcMain.handle('window-clear-cache', async () => {
        return mainWindow?.webContents.session.clearCache();
    });

    ipcMain.handle('window-clear-browser-data', async () => {
        const session = mainWindow?.webContents.session;
        if (!session) return;

        // Clear storage data but preserve localStorage (server configurations)
        await session.clearStorageData({
            storages: [
                'cookies',
                'filesystem',
                'indexdb',
                'shadercache',
                'websql',
                'serviceworkers',
                'cachestorage',
            ],
        });

        // Also clear the cache
        await session.clearCache();

        // Clear auth cache specifically
        await session.clearAuthCache();
    });

    ipcMain.handle(
        'app-check-for-updates',
        async (): Promise<{ updateAvailable: boolean; version?: string }> => {
            if (disableAutoUpdates()) {
                console.log('Auto updates are disabled');
                return { updateAvailable: false };
            }

            try {
                console.log('Checking for updates');
                const updater = configureAndGetUpdater();
                const result = await updater.checkForUpdates();
                const updateAvailable = result?.isUpdateAvailable ?? false;
                console.log('Update available:', updateAvailable);
                if (updateAvailable && store.get('disable_auto_updates') !== true) {
                    console.log('Downloading update');
                    updater.downloadUpdate();
                }

                return {
                    updateAvailable,
                    version: result?.updateInfo?.version,
                };
            } catch {
                console.log('Error checking for updates');
                return { updateAvailable: false };
            }
        },
    );

    ipcMain.on('app-restart', () => {
        // Fix for .AppImage
        if (process.env.APPIMAGE) {
            app.exit();
            app.relaunch({
                args: process.argv.slice(1).concat(['--appimage-extract-and-run']),
                execPath: process.env.APPIMAGE,
            });
            app.exit(0);
        } else {
            app.relaunch();
            app.exit(0);
        }
    });

    ipcMain.on('global-media-keys-enable', () => {
        enableMediaKeys(mainWindow);
    });

    ipcMain.on('global-media-keys-disable', () => {
        disableMediaKeys();
    });

    ipcMain.on('download-url', (_event, url: string) => {
        mainWindow?.webContents.downloadURL(url);
    });

    // Add specific handler for authentication URLs
    ipcMain.on('open-auth-window', (_event, url: string) => {
        createAuthWindow(url);
    });

    const globalMediaKeysEnabled = store.get('global_media_hotkeys', true) as boolean;

    if (globalMediaKeysEnabled) {
        enableMediaKeys(mainWindow);
    }

    const startWindowMinimized = store.get('window_start_minimized', false) as boolean;

    mainWindow.on('ready-to-show', () => {
        // mainWindow.show()

        if (!mainWindow) {
            throw new Error('"mainWindow" is not defined');
        }

        if (!first || !startWindowMinimized) {
            const maximized = store.get('maximized');
            const fullScreen = store.get('fullscreen');

            if (maximized) {
                mainWindow.maximize();
            }
            if (fullScreen) {
                mainWindow.setFullScreen(true);
            }

            mainWindow.show();
            createWinThumbarButtons();
        }
    });

    mainWindow.on('closed', () => {
        ipcMain.removeHandler('window-clear-cache');
        ipcMain.removeHandler('window-clear-browser-data');
        mainWindow = null;
    });

    mainWindow.on('close', (event) => {
        store.set('bounds', mainWindow?.getNormalBounds());
        store.set('maximized', mainWindow?.isMaximized());
        store.set('fullscreen', mainWindow?.isFullScreen());

        if (!exitFromTray && store.get('window_exit_to_tray')) {
            event.preventDefault();
            mainWindow?.hide();
        }

        if (forceQuit) {
            app.exit();
        }
    });

    (mainWindow as any).on('minimize', (event: any) => {
        if (store.get('window_minimize_to_tray') === true) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });

    if (isWindows()) {
        app.setAppUserModelId('org.jeffvli.feishin');
    }

    if (isMacOS()) {
        app.on('before-quit', () => {
            forceQuit = true;
        });
    }

    const menuBuilder = new MenuBuilder(mainWindow);
    menuBuilder.buildMenu();

    if (process.platform !== 'darwin') {
        Menu.setApplicationMenu(null);
    }

    // Open URLs in the user's browser
    mainWindow.webContents.setWindowOpenHandler((edata) => {
        shell.openExternal(edata.url);
        return { action: 'deny' };
    });

    if (!disableAutoUpdates() && store.get('disable_auto_updates') !== true) {
        new AppUpdater();
    }

    const theme = store.get('theme') as TitleTheme | undefined;
    nativeTheme.themeSource = theme || 'dark';

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url);
        return { action: 'deny' };
    });

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }
}

// Only allow hardware media key handling if:
// 1. The "Enable Media Session" setting is enabled
// 2. The playback type is WEB (mpv not supported)
// 3. The platform is not Linux (because we are using mpris instead)
const enableMediaSession = store.get('mediaSession', false) as boolean;
const playbackType = store.get('playbackType', PlayerType.WEB) as PlayerType;
const shouldDisableMediaFeatures =
    isLinux() || !enableMediaSession || playbackType !== PlayerType.WEB;

if (shouldDisableMediaFeatures) {
    app.commandLine.appendSwitch(
        'disable-features',
        'HardwareMediaKeyHandling,MediaSessionService',
    );
}

// https://github.com/electron/electron/issues/46538#issuecomment-2808806722
app.commandLine.appendSwitch('gtk-version', '3');

// Enable garbage collection API
app.commandLine.appendSwitch('js-flags', '--expose-gc');

// Must duplicate with the one in renderer process settings.store.ts
enum BindingActions {
    GLOBAL_SEARCH = 'globalSearch',
    LOCAL_SEARCH = 'localSearch',
    MUTE = 'volumeMute',
    NEXT = 'next',
    PAUSE = 'pause',
    PLAY = 'play',
    PLAY_PAUSE = 'playPause',
    PREVIOUS = 'previous',
    SHUFFLE = 'toggleShuffle',
    SKIP_BACKWARD = 'skipBackward',
    SKIP_FORWARD = 'skipForward',
    STOP = 'stop',
    TOGGLE_FULLSCREEN_PLAYER = 'toggleFullscreenPlayer',
    TOGGLE_QUEUE = 'toggleQueue',
    TOGGLE_REPEAT = 'toggleRepeat',
    VOLUME_DOWN = 'volumeDown',
    VOLUME_UP = 'volumeUp',
}

const HOTKEY_ACTIONS: Record<BindingActions, () => void> = {
    [BindingActions.GLOBAL_SEARCH]: () => {},
    [BindingActions.LOCAL_SEARCH]: () => {},
    [BindingActions.MUTE]: () => getMainWindow()?.webContents.send('renderer-player-volume-mute'),
    [BindingActions.NEXT]: () => getMainWindow()?.webContents.send('renderer-player-next'),
    [BindingActions.PAUSE]: () => getMainWindow()?.webContents.send('renderer-player-pause'),
    [BindingActions.PLAY]: () => getMainWindow()?.webContents.send('renderer-player-play'),
    [BindingActions.PLAY_PAUSE]: () =>
        getMainWindow()?.webContents.send('renderer-player-play-pause'),
    [BindingActions.PREVIOUS]: () => getMainWindow()?.webContents.send('renderer-player-previous'),
    [BindingActions.SHUFFLE]: () =>
        getMainWindow()?.webContents.send('renderer-player-toggle-shuffle'),
    [BindingActions.SKIP_BACKWARD]: () =>
        getMainWindow()?.webContents.send('renderer-player-skip-backward'),
    [BindingActions.SKIP_FORWARD]: () =>
        getMainWindow()?.webContents.send('renderer-player-skip-forward'),
    [BindingActions.STOP]: () => getMainWindow()?.webContents.send('renderer-player-stop'),
    [BindingActions.TOGGLE_FULLSCREEN_PLAYER]: () => {},
    [BindingActions.TOGGLE_QUEUE]: () => {},
    [BindingActions.TOGGLE_REPEAT]: () =>
        getMainWindow()?.webContents.send('renderer-player-toggle-repeat'),
    [BindingActions.VOLUME_DOWN]: () =>
        getMainWindow()?.webContents.send('renderer-player-volume-down'),
    [BindingActions.VOLUME_UP]: () =>
        getMainWindow()?.webContents.send('renderer-player-volume-up'),
};

ipcMain.on(
    'set-global-shortcuts',
    (
        _event,
        data: Record<BindingActions, { allowGlobal: boolean; hotkey: string; isGlobal: boolean }>,
    ) => {
        // Since we're not tracking the previous shortcuts, we need to unregister all of them
        globalShortcut.unregisterAll();

        for (const shortcut of Object.keys(data)) {
            const isGlobalHotkey = data[shortcut as BindingActions].isGlobal;
            const isValidHotkey =
                data[shortcut as BindingActions].hotkey &&
                data[shortcut as BindingActions].hotkey !== '';

            if (isGlobalHotkey && isValidHotkey) {
                const accelerator = hotkeyToElectronAccelerator(
                    data[shortcut as BindingActions].hotkey,
                );

                globalShortcut.register(accelerator, () => {
                    HOTKEY_ACTIONS[shortcut as BindingActions]();
                });
            }
        }

        const globalMediaKeysEnabled = store.get('global_media_hotkeys', true) as boolean;

        if (globalMediaKeysEnabled) {
            enableMediaKeys(mainWindow);
        }
    },
);

ipcMain.on(
    'logger',
    (
        _event,
        data: {
            message: string;
            type: 'debug' | 'error' | 'info' | 'success' | 'verbose' | 'warning';
        },
    ) => {
        createLog(data);
    },
);

ipcMain.handle('power-save-blocker-start', () => {
    if (powerSaveBlockerId !== null) {
        return powerSaveBlockerId;
    }

    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    return powerSaveBlockerId;
});

ipcMain.handle('power-save-blocker-stop', () => {
    if (powerSaveBlockerId !== null) {
        const stopped = powerSaveBlocker.stop(powerSaveBlockerId);
        powerSaveBlockerId = null;
        return stopped;
    }
    return false;
});

ipcMain.handle('power-save-blocker-is-started', () => {
    return powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId);
});

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    // Respect the OSX convention of having the application in memory even
    // after all windows have been closed
    if (isMacOS()) {
        mainWindow = null;
    } else {
        app.quit();
    }
});

const FONT_HEADERS = [
    'font/collection',
    'font/otf',
    'font/sfnt',
    'font/ttf',
    'font/woff',
    'font/woff2',
];

const singleInstance = isDevelopment ? true : app.requestSingleInstanceLock();

if (!singleInstance) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            } else if (!mainWindow.isVisible()) {
                mainWindow.show();
            }

            mainWindow.focus();
        }
    });

    app.whenReady()
        .then(() => {
            protocol.handle('feishin', async (request) => {
                const filePath = `file://${request.url.slice('feishin://'.length)}`;
                const response = await net.fetch(filePath);
                const contentType = response.headers.get('content-type');

                if (!contentType || !FONT_HEADERS.includes(contentType)) {
                    getMainWindow()?.webContents.send('custom-font-error', filePath);

                    return new Response(null, {
                        status: 403,
                        statusText: 'Forbidden',
                    });
                }

                return response;
            });

            createWindow();
            if (store.get('window_enable_tray', true)) {
                createTray();
            }
            app.on('activate', () => {
                // On macOS it's common to re-create a window in the app when the
                // dock icon is clicked and there are no other windows open.
                if (mainWindow === null) createWindow(false);
                else if (!mainWindow.isVisible()) {
                    mainWindow.show();
                    createWinThumbarButtons();
                }
            });
        })
        .catch(console.log);
}

// Register 'open-item' handler globally, ensuring it is only registered once
if (!ipcMain.eventNames().includes('open-item')) {
    ipcMain.handle('open-item', async (_event, path: string) => {
        return new Promise<void>((resolve, reject) => {
            access(path, constants.F_OK, (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                shell.showItemInFolder(path);
                resolve();
            });
        });
    });
}

// Register 'open-application-directory' handler globally, ensuring it is only registered once
if (!ipcMain.eventNames().includes('open-application-directory')) {
    ipcMain.handle('open-application-directory', async () => {
        const userDataPath = app.getPath('userData');
        shell.openPath(userDataPath);
    });
}
