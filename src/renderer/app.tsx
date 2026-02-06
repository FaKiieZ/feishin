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
import { useCheckForUpdates } from '/@/renderer/hooks/use-check-for-updates';
import { useSyncSettingsToMain } from '/@/renderer/hooks/use-sync-settings-to-main';
import { AppRouter } from '/@/renderer/router/app-router';
import { useCssSettings, useHotkeySettings, useLanguage } from '/@/renderer/store';
import { useAppTheme } from '/@/renderer/themes/use-app-theme';
import { sanitizeCss } from '/@/renderer/utils/sanitize';
import { ReauthenticationManager } from '/@/renderer/utils/reauthentication-manager';
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
    useCheckForUpdates();

    // Clean up any stored reauthenticating server ID on app startup to prevent loops
    useEffect(() => {
        ReauthenticationManager.forceCleanup();
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
                const reauthServerId = await ReauthenticationManager.getStoredServerId();

                if (reauthServerId) {
                    // Clear the stored server ID first to prevent loops
                    await ReauthenticationManager.clearReauthenticating(reauthServerId);

                    // Instead of immediately reloading, check if the server is reachable
                    try {
                        const { getServerById } = await import('/@/renderer/store');
                        const server = getServerById(reauthServerId);

                        if (!server) {
                            // Server not found, redirect to server selection
                            window.location.href = '/#/action-required';
                            return;
                        }

                        // Test server connectivity with a simple fetch with timeout
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 5000);

                        await fetch(server.url, {
                            method: 'HEAD',
                            mode: 'no-cors', // Allow checking connectivity even with CORS issues
                            signal: controller.signal,
                        });
                        clearTimeout(timeoutId);

                        // If we get here, server appears to be reachable, reload the app
                        window.location.reload();
                    } catch (error) {
                        // Server is not reachable or fetch failed, redirect to server selection instead of reloading
                        console.warn(
                            'Server unreachable after auth success, redirecting to server selection:',
                            error,
                        );

                        // Clear the current server to force server selection
                        try {
                            const { useAuthStore } = await import('/@/renderer/store');
                            useAuthStore.getState().actions.setCurrentServer(null);
                        } catch (storeError) {
                            // Ignore store errors
                        }

                        // Redirect to server selection page
                        window.location.href = '/#/action-required';
                    }
                }
            };

            const handleAuthFailed = async (data: {
                errorDescription?: string;
                reason: string;
            }) => {
                console.warn('Authentication failed:', data);
                console.log('Handling auth failure, redirecting to server selection...');

                // Clear any stored reauthenticating server ID to prevent loops
                await ReauthenticationManager.forceCleanup();

                // Clear the current server to force server selection
                try {
                    const { useAuthStore } = await import('/@/renderer/store');
                    useAuthStore.getState().actions.setCurrentServer(null);
                    console.log('Cleared current server');
                } catch (storeError) {
                    console.error('Failed to clear current server:', storeError);
                }

                // Show appropriate message based on failure reason
                if (data.reason === 'server_unreachable') {
                    const { toast } = await import('/@/shared/components/toast/toast');
                    toast.error({
                        message:
                            'Server is unreachable. Please check your connection or try a different server.',
                    });
                } else if (data.reason === 'timeout') {
                    const { toast } = await import('/@/shared/components/toast/toast');
                    toast.error({
                        message:
                            'Authentication timed out. Please try again or select a different server.',
                    });
                } else if (data.reason === 'server_error') {
                    const { toast } = await import('/@/shared/components/toast/toast');
                    toast.error({
                        message:
                            'Server error detected. The music server appears to be down. Please try a different server.',
                    });
                }

                // The app outlet will automatically redirect to action-required when currentServer becomes null
                console.log('Server cleared, app outlet should handle redirect to action-required');
            };

            utils.authSuccessListener(handleAuthSuccess);

            // Listen for auth failures from main process
            if (utils?.authFailedListener) {
                utils.authFailedListener((_event, data) => {
                    handleAuthFailed(data);
                });
            }
        }

        // Cleanup is handled automatically by the IPC system
        return () => {
            // Cleanup handled by IPC system automatically
        };
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
