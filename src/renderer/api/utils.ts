import { useAuthStore, usePlayerStoreBase } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import { ServerListItemWithCredential } from '/@/shared/types/domain-types';

export const authenticationFailure = (currentServer: null | ServerListItemWithCredential) => {
    // Pause playback immediately to prevent the player from skipping to the next song
    // and triggering a loop of re-auth attempts
    usePlayerStoreBase.getState().mediaPause();

    // Do not show the toast if we are opening the SSO window
    // because the user knows they are being re-authenticated
    if (!currentServer?.ssoEnabled) {
        toast.error({
            message: 'Your session has expired.',
        });
    }

    if (currentServer) {
        if (currentServer.ssoEnabled) {
            // Set flag to prevent track skipping during re-authentication
            useAuthStore.getState().actions.setIsSSOReauthInProgress(true);
            window.dispatchEvent(
                new CustomEvent('auth:sso-session-expired', {
                    detail: { serverId: currentServer.id },
                }),
            );
            return;
        }

        const serverId = currentServer.id;
        const token = currentServer.ndCredential;
        console.error(`token is expired: ${token}`);
        useAuthStore.getState().actions.updateServer(serverId, { ndCredential: undefined });
        useAuthStore.getState().actions.setCurrentServer(null);
    }
};
