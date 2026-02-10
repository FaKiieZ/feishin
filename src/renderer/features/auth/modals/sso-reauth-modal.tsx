import { Modal } from '@mantine/core';
import isElectron from 'is-electron';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '/@/renderer/api';
import { useAuthStore } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { IPC_EVENTS, SSO_FLOW_IDS } from '/@/shared/constants';

export const SSOReauthModal = () => {
    const { t } = useTranslation();
    const [opened, setOpened] = useState(false);

    // We use a ref to track if we're currently polling/handling an SSO flow
    // to prevent duplicate triggers or weird state
    const isHandlingRef = useRef(false);
    const pollingRef = useRef<null | number>(null);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            window.clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        isHandlingRef.current = false;
    }, []);

    const handleLogin = useCallback(() => {
        // Always get fresh state from store directly to avoid stale closures
        const currentServer = useAuthStore.getState().currentServer;

        if (!currentServer) {
            console.error('[SSOReauthModal] No current server found');
            return;
        }

        const url_to_open = currentServer.ssoUrl || currentServer.url;
        console.log('[SSOReauthModal] Opening SSO window for:', url_to_open);

        if (isElectron()) {
            window.api.ipc.send(IPC_EVENTS.AUTH_OPEN_SSO, url_to_open, SSO_FLOW_IDS.REAUTH);

            // Start polling for successful connection
            stopPolling();
            isHandlingRef.current = true;

            pollingRef.current = window.setInterval(async () => {
                if (!currentServer.userId) return;

                try {
                    // Try to fetch user info. If it succeeds, the SSO cookie is valid.
                    const userInfo = await api.controller.getUserInfo({
                        apiClientProps: { serverId: currentServer.id, silent: true },
                        query: { id: currentServer.userId, username: currentServer.username },
                    });

                    if (userInfo) {
                        // Success! Close SSO window and reload
                        // Explicitly set the current server again to ensure it is persisted and selected on reload
                        useAuthStore.getState().actions.setCurrentServer(currentServer);
                        // Clear the re-auth flag to allow track skipping again
                        useAuthStore.getState().actions.setIsSSOReauthInProgress(false);

                        (window.api as any).ipc.send(IPC_EVENTS.AUTH_CLOSE_SSO);
                        stopPolling();
                        setOpened(false);
                        window.location.reload();
                    }
                } catch {
                    // Ignore errors (401, network, etc) while polling
                }
            }, 2000);
        } else {
            // Web fallback: open in new tab
            window.open(url_to_open, '_blank');
        }
    }, [stopPolling]);

    useEffect(() => {
        const handleSSOSessionExpired = () => {
            if (isElectron()) {
                // In Electron, we want to open the window directly without showing the modal
                // unless it fails or something weird happens. But user requested "just open up ... directly".
                handleLogin();
            } else {
                setOpened(true);
            }
        };

        const handleSSOClosed = (_event: any, flowId?: string) => {
            if (flowId !== SSO_FLOW_IDS.REAUTH) return;
            setOpened(false);
            stopPolling();
            // Clear the re-auth flag when window is closed
            useAuthStore.getState().actions.setIsSSOReauthInProgress(false);
            window.location.reload();
        };

        window.addEventListener(IPC_EVENTS.AUTH_SSO_SESSION_EXPIRED, handleSSOSessionExpired);
        if (isElectron()) {
            window.api.ipc.on(IPC_EVENTS.AUTH_SSO_CLOSED, handleSSOClosed);
        }

        return () => {
            stopPolling();
            window.removeEventListener(
                IPC_EVENTS.AUTH_SSO_SESSION_EXPIRED,
                handleSSOSessionExpired,
            );
            if (isElectron()) {
                window.api.ipc.off(IPC_EVENTS.AUTH_SSO_CLOSED, handleSSOClosed);
            }
        };
    }, [handleLogin, stopPolling]);

    // Auto-open SSO window when the modal opens (only relevant for Web now, or if we decide to show modal in Electron later)
    useEffect(() => {
        if (opened && !isElectron()) {
            // For web, we might still want to wait for user click due to popup blockers,
            // so maybe don't auto-open here?
            // But valid point: if they are on web, 'handleLogin' uses window.open which might be blocked.
            // So we let them click the button.
        }
    }, [opened]);

    // Clean up on unmount or close
    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

    // For Web, we need the currentServer for the UI text
    const currentServer = useAuthStore((state) => state.currentServer);

    // In Electron, we render nothing (invisible handler).
    // In Web, we render the modal.
    if (isElectron()) {
        return null;
    }

    return (
        <Modal
            centered
            closeOnClickOutside={false}
            closeOnEscape={false}
            onClose={() => {
                setOpened(false);
                stopPolling();
            }}
            opened={opened}
            title={t('error.sessionExpiredError', { defaultValue: 'SSO Session Expired' })}
            withCloseButton={false}
        >
            <Stack>
                <Text>
                    {t('auth.ssoSessionExpiredDescription', {
                        defaultValue:
                            'Your SSO session has expired. Please log in again to continue accessing {{serverName}}.',
                        serverName: currentServer?.name,
                    })}
                </Text>
                <Button fullWidth onClick={handleLogin}>
                    {t('auth.openLoginTab', { defaultValue: 'Open Login Tab' })}
                </Button>
                <Button fullWidth onClick={() => setOpened(false)} variant="outline">
                    {t('auth.iHaveLoggedIn', { defaultValue: 'I have logged in' })}
                </Button>
            </Stack>
        </Modal>
    );
};
