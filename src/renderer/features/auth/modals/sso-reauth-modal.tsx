import { Modal } from '@mantine/core';
import isElectron from 'is-electron';
import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '/@/renderer/api';
import { useAuthStore } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

export const SSOReauthModal = () => {
    const { t } = useTranslation();
    const [opened, setOpened] = useState(false);
    const currentServer = useAuthStore((state) => state.currentServer);

    useEffect(() => {
        const handleSSOSessionExpired = () => {
            console.log('Received auth:sso-session-expired event');
            setOpened(true);
        };

        const handleSSOClosed = (_event: any, flowId?: string) => {
            // Only handle if it matches our flow (or is undefined for backward compatibility if needed, but better strict)
            if (flowId !== 'reauth') return;

            console.log('Received auth:sso-closed event for reauth');
            setOpened(false);
            stopPolling();
            // Optionally reload or retry requests here if needed
            // For now, user can click retry or navigate manually
            window.location.reload(); 
        };

        window.addEventListener('auth:sso-session-expired', handleSSOSessionExpired);
        if (isElectron()) {
             (window.api as any)?.ipc.on('auth:sso-closed', handleSSOClosed);
        }

        return () => {
            stopPolling();
            window.removeEventListener('auth:sso-session-expired', handleSSOSessionExpired);
            if (isElectron()) {
                 (window.api as any)?.ipc.off('auth:sso-closed', handleSSOClosed);
            }
        };
    }, []);

    const pollingRef = useRef<number | null>(null);

    const stopPolling = () => {
        if (pollingRef.current) {
            window.clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };

    const handleLogin = () => {
        if (!currentServer) return;
        
        const url_to_open = currentServer.ssoUrl || currentServer.url;

        if (isElectron()) {
            (window.api as any).ipc.send('auth:open-sso', url_to_open, 'reauth');

            // Start polling for successful connection
            stopPolling();
            pollingRef.current = window.setInterval(async () => {
                if (!currentServer.userId) return;

                try {
                    // Try to fetch user info. If it succeeds, the SSO cookie is valid.
                    const userInfo = await api.controller.getUserInfo({
                        apiClientProps: { serverId: currentServer.id },
                        query: { id: currentServer.userId, username: currentServer.username }
                    });

                    if (userInfo) {
                        // Success! Close SSO window and reload
                        (window.api as any).ipc.send('auth:close-sso');
                        stopPolling();
                        setOpened(false);
                        window.location.reload();
                    }
                } catch (e) {
                    // Ignore errors (401, network, etc) while polling
                }
            }, 2000);
        } else {
            // Web fallback: open in new tab
            window.open(url_to_open, '_blank');
        }
    };

    // Clean up on unmount or close
    useEffect(() => {
        return () => stopPolling();
    }, []);

    return (
        <Modal
            opened={opened}
            onClose={() => { setOpened(false); stopPolling(); }}
            title={t('error.sessionExpiredError', { defaultValue: 'SSO Session Expired' })}
            centered
            withCloseButton={false}
            closeOnClickOutside={false}
            closeOnEscape={false}
        >
            <Stack>
                <Text>
                    {t('auth.ssoSessionExpiredDescription', { 
                        defaultValue: 'Your SSO session has expired. Please log in again to continue accessing {{serverName}}.',
                        serverName: currentServer?.name 
                    })}
                </Text>
                <Button onClick={handleLogin} fullWidth>
                    {isElectron() ? t('auth.openSsoWindow', { defaultValue: 'Open SSO Login Window' }) : t('auth.openLoginTab', { defaultValue: 'Open Login Tab' })}
                </Button>
                {!isElectron() && (
                    <Button variant="outline" onClick={() => setOpened(false)} fullWidth>
                        {t('auth.iHaveLoggedIn', { defaultValue: 'I have logged in' })}
                    </Button>
                )}
            </Stack>
        </Modal>
    );
};
