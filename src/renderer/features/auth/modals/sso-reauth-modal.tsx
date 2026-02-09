import { Modal } from '@mantine/core';
import isElectron from 'is-electron';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

        const handleSSOClosed = () => {
            console.log('Received auth:sso-closed event');
            setOpened(false);
            // Optionally reload or retry requests here if needed
            // For now, user can click retry or navigate manually
            window.location.reload(); 
        };

        window.addEventListener('auth:sso-session-expired', handleSSOSessionExpired);
        if (isElectron()) {
             (window.api as any)?.ipc.on('auth:sso-closed', handleSSOClosed);
        }

        return () => {
            window.removeEventListener('auth:sso-session-expired', handleSSOSessionExpired);
            if (isElectron()) {
                 (window.api as any)?.ipc.off('auth:sso-closed', handleSSOClosed);
            }
        };
    }, []);

    const handleLogin = () => {
        if (!currentServer) return;
        
        const url_to_open = currentServer.ssoUrl || currentServer.url;

        if (isElectron()) {
            (window.api as any).ipc.send('auth:open-sso', url_to_open);
        } else {
            // Web fallback: open in new tab
            window.open(url_to_open, '_blank');
            // In web, we can't easily detect when the tab closes or auth finishes
            // so we might provide a "I've logged in" button
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={() => setOpened(false)}
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
