import isElectron from 'is-electron';

/**
 * Centralized manager for handling reauthentication state to prevent infinite loops.
 * Provides a unified interface for storing, checking, and clearing reauthentication status.
 */
export class ReauthenticationManager {
    private static readonly STORAGE_KEY = 'reauthenticating_server_id';

    /**
     * Clear reauthentication status for a specific server or all servers
     * @param serverId - Optional server ID to clear. If not provided, clears all reauthentication status
     */
    static async clearReauthenticating(serverId?: string): Promise<void> {
        try {
            // If serverId is provided, only clear if it matches the stored value
            if (serverId) {
                const storedServerId = await this.getStoredServerId();
                if (storedServerId !== serverId) {
                    return; // Not the currently reauthenticating server, no need to clear
                }
            }

            if (isElectron() && window.api?.localSettings) {
                await window.api.localSettings.set(this.STORAGE_KEY, undefined);
            } else {
                // Fallback for web environments
                sessionStorage.removeItem(this.STORAGE_KEY);
            }
        } catch (error) {
            console.error('Failed to clear reauthentication status:', error);
            throw error;
        }
    }

    /**
     * Force clear all reauthentication state regardless of stored server ID
     * Useful for cleanup during app startup or error recovery
     */
    static async forceCleanup(): Promise<void> {
        try {
            if (isElectron() && window.api?.localSettings) {
                await window.api.localSettings.set(this.STORAGE_KEY, undefined);
            } else {
                sessionStorage.removeItem(this.STORAGE_KEY);
            }
        } catch (error) {
            console.warn('Failed to force cleanup reauthentication status:', error);
            // Don't throw on force cleanup - it should be resilient
        }
    }

    /**
     * Get the currently stored reauthenticating server ID
     * @returns Promise<string | null> The stored server ID or null if none exists
     */
    static async getStoredServerId(): Promise<null | string> {
        try {
            if (isElectron() && window.api?.localSettings) {
                const result = await window.api.localSettings.get(this.STORAGE_KEY);
                return result || null;
            } else {
                // Fallback for web environments
                return sessionStorage.getItem(this.STORAGE_KEY);
            }
        } catch (error) {
            console.warn('Failed to get stored server ID:', error);
            return null;
        }
    }

    /**
     * Check if a server is currently in a reauthentication state
     * @param serverId - The server ID to check
     * @returns Promise<boolean> indicating if the server is currently reauthenticating
     */
    static async isReauthenticating(serverId: string): Promise<boolean> {
        try {
            const storedServerId = await this.getStoredServerId();
            return storedServerId === serverId;
        } catch (error) {
            console.warn('Failed to check reauthentication status:', error);
            return false;
        }
    }

    /**
     * Mark a server as currently reauthenticating
     * @param serverId - The server ID to mark as reauthenticating
     */
    static async setReauthenticating(serverId: string): Promise<void> {
        try {
            if (isElectron() && window.api?.localSettings) {
                await window.api.localSettings.set(this.STORAGE_KEY, serverId);
            } else {
                // Fallback for web environments
                sessionStorage.setItem(this.STORAGE_KEY, serverId);
            }
        } catch (error) {
            console.error('Failed to set reauthentication status:', error);
            throw error;
        }
    }
}
