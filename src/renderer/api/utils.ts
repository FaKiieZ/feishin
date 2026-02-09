import { useAuthStore } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import { ServerListItem } from '/@/shared/types/types';

export const authenticationFailure = (currentServer: null | ServerListItem) => {
    toast.error({
        message: 'Your session has expired.',
    });

    if (currentServer) {
        if (currentServer.ssoEnabled) {
            console.log('SSO session expired, triggering re-auth flow');
            window.dispatchEvent(new CustomEvent('auth:sso-session-expired'));
            return;
        }

        const serverId = currentServer.id;
        const token = currentServer.ndCredential;
        console.error(`token is expired: ${token}`);
        useAuthStore.getState().actions.updateServer(serverId, { ndCredential: undefined });
        useAuthStore.getState().actions.setCurrentServer(null);
    }
};
