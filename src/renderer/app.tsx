/* eslint-disable perfectionist/sort-imports */
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import 'overlayscrollbars/overlayscrollbars.css';
import '/styles/overlayscrollbars.css';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import isElectron from 'is-electron';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import i18n from '/@/i18n/i18n';
import { WebAudioContext } from '/@/renderer/features/player/context/webaudio-context';
import { useSyncSettingsToMain } from '/@/renderer/hooks/use-sync-settings-to-main';
import { AppRouter } from '/@/renderer/router/app-router';
import { useCssSettings, useHotkeySettings, useLanguage } from '/@/renderer/store';
import { useAppTheme } from '/@/renderer/themes/use-app-theme';
import { sanitizeCss } from '/@/renderer/utils/sanitize';
import { WebAudio } from '/@/shared/types/types';
import '/@/shared/styles/global.css';
import { PlayerProvider } from '/@/renderer/features/player/context/player-context';
import { AudioPlayers } from '/@/renderer/features/player/components/audio-players';

const ReleaseNotesModal = lazy(() =>
    import('./release-notes-modal').then((module) => ({
        default: module.ReleaseNotesModal,
    })),
);

const ipc = isElectron() ? window.api.ipc : null;
const utils = isElectron() ? window.api.utils : null;

export const App = () => {
    const { mode, theme } = useAppTheme();
    const language = useLanguage();

    const { content, enabled } = useCssSettings();
    const { bindings } = useHotkeySettings();
    const cssRef = useRef<HTMLStyleElement | null>(null);

    useSyncSettingsToMain();

    // Clean up any stored reauthenticating server ID on app startup to prevent loops
    useEffect(() => {
        const cleanupReauthState = async () => {
            const localSettings = isElectron() ? window.api.localSettings : null;
            if (localSettings) {
                try {
                    await localSettings.set('reauthenticating_server_id', undefined);
                } catch (error) {
                    // Ignore errors
                }
            } else {
                // Fallback for web - use sessionStorage
                sessionStorage.removeItem('reauthenticating_server_id');
            }
        };
        cleanupReauthState();
    }, []);

    const [webAudio, setWebAudio] = useState<WebAudio>();

    useEffect(() => {
        if (enabled && content) {
            // Yes, CSS is sanitized here as well. Prevent a suer from changing the
            // localStorage to bypass sanitizing.
            const sanitized = sanitizeCss(content);
            if (!cssRef.current) {
                cssRef.current = document.createElement('style');
                document.body.appendChild(cssRef.current);
            }

            cssRef.current.textContent = sanitized;

            return () => {
                cssRef.current!.textContent = '';
            };
        }

        return () => {};
    }, [content, enabled]);

    const webAudioProvider = useMemo(() => {
        return { setWebAudio, webAudio };
    }, [webAudio]);

    useEffect(() => {
        if (isElectron()) {
            ipc?.send('set-global-shortcuts', bindings);
        }
    }, [bindings]);

    useEffect(() => {
        if (language) {
            i18n.changeLanguage(language);
        }
    }, [language]);

    useEffect(() => {
        if (isElectron() && utils?.authSuccessListener) {
            const handleAuthSuccess = async () => {
                // Check if we're in a cookie authentication flow (indicated by stored server ID)
                const localSettings = isElectron() ? window.api.localSettings : null;
                let reauthServerId: null | string = null;

                try {
                    if (localSettings) {
                        // For electron, use the localSettings API
                        reauthServerId = await localSettings.get('reauthenticating_server_id');
                    } else {
                        // Fallback for web - use sessionStorage
                        reauthServerId = sessionStorage.getItem('reauthenticating_server_id');
                    }
                } catch (error) {
                    // Ignore errors accessing storage
                }

                if (reauthServerId) {
                    // Clear the stored server ID
                    try {
                        if (localSettings) {
                            await localSettings.set('reauthenticating_server_id', undefined);
                        } else {
                            sessionStorage.removeItem('reauthenticating_server_id');
                        }
                    } catch (error) {
                        // Ignore errors
                    }

                    // Reload the app to trigger reauthentication
                    window.location.reload();
                }
            };

            utils.authSuccessListener(handleAuthSuccess);
        }

        // Cleanup is handled automatically by the IPC system
    }, []);

    const notificationStyles = useMemo(
        () => ({
            root: {
                marginBottom: 90,
            },
        }),
        [],
    );

    return (
        <MantineProvider forceColorScheme={mode} theme={theme}>
            <Notifications
                containerWidth="300px"
                position="bottom-center"
                styles={notificationStyles}
                zIndex={50000}
            />
            <WebAudioContext.Provider value={webAudioProvider}>
                <PlayerProvider>
                    <AudioPlayers />
                    <AppRouter />
                </PlayerProvider>
            </WebAudioContext.Provider>
            <Suspense fallback={null}>
                <ReleaseNotesModal />
            </Suspense>
        </MantineProvider>
    );
};
