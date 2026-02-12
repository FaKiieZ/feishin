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
    const [targetServerId, setTargetServerId] = useState<string | null>(null);

    const pollingRef = useRef<null | number>(null);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            window.clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    const handleLogin = useCallback(() => {
        const state = useAuthStore.getState();
        const server = targetServerId ? state.serverList[targetServerId] : state.currentServer;

        if (!server) {
            console.error('[SSOReauthModal] No server found for re-auth');
            return;
        }

        const url_to_open = server.ssoUrl || server.url;
        console.log('[SSOReauthModal] Opening SSO window for:', url_to_open);

        if (isElectron()) {
            window.api.ipc.send(IPC_EVENTS.AUTH_OPEN_SSO, url_to_open, SSO_FLOW_IDS.REAUTH);

            // Start polling for successful connection
            stopPolling();

            pollingRef.current = window.setInterval(async () => {
                if (!server.userId) return;

                try {
                    // Try to fetch user info. If it succeeds, the SSO cookie is valid.
                    const userInfo = await api.controller.getUserInfo({
                        apiClientProps: { serverId: server.id, silent: true },
                        query: { id: server.userId, username: server.username },
                    });

                    if (userInfo) {
                        // Success! Close SSO window and reload
                        // Explicitly set the current server again to ensure it is persisted and selected on reload
                        useAuthStore.getState().actions.setCurrentServer(server);
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
    }, [stopPolling, targetServerId]);

    useEffect(() => {
        const handleSSOSessionExpired = (event: Event) => {
            const customEvent = event as CustomEvent;
            if (customEvent.detail?.serverId) {
                setTargetServerId(customEvent.detail.serverId);
            }
            setOpened(true);
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
    }, [stopPolling]);

    // Clean up on unmount or close
    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

    const currentServer = useAuthStore((state) => state.currentServer);
    const serverList = useAuthStore((state) => state.serverList);
    const activeServer = targetServerId ? serverList[targetServerId] : currentServer;

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
                        serverName: activeServer?.name,
                    })}
                </Text>
                <Button fullWidth onClick={handleLogin}>
                    {isElectron()
                        ? t('auth.openLoginWindow', { defaultValue: 'Open Login Window' })
                        : t('auth.openLoginTab', { defaultValue: 'Open Login Tab' })}
                </Button>
                <Button fullWidth onClick={() => setOpened(false)} variant="outline">
                    {t('auth.iHaveLoggedIn', { defaultValue: 'I have logged in' })}
                </Button>
            </Stack>
        </Modal>
    );
};
