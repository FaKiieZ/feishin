/**
 * Simple test script to validate ReauthenticationManager functionality
 */

// Mock the required dependencies for testing
(global as any).window = {
    api: null, // Simulating non-Electron environment
};

// Mock sessionStorage
const mockSessionStorage = {
    getItem(key: string) {
        return this.storage.get(key) || null;
    },
    removeItem(key: string) {
        this.storage.delete(key);
    },
    setItem(key: string, value: string) {
        this.storage.set(key, value);
    },
    storage: new Map<string, string>(),
};

(global as any).sessionStorage = mockSessionStorage;

// Mock isElectron
jest.mock('is-electron', () => () => false);

import { ReauthenticationManager } from '../src/renderer/utils/reauthentication-manager';

async function testReauthenticationManager() {
    console.log('Testing ReauthenticationManager...');

    // Test 1: Initially no server is reauthenticating
    const initialCheck = await ReauthenticationManager.isReauthenticating('server1');
    console.log('Initial check (should be false):', initialCheck);

    // Test 2: Set a server as reauthenticating
    await ReauthenticationManager.setReauthenticating('server1');
    const afterSet = await ReauthenticationManager.isReauthenticating('server1');
    console.log('After setting server1 (should be true):', afterSet);

    // Test 3: Check different server (should be false)
    const differentServer = await ReauthenticationManager.isReauthenticating('server2');
    console.log('Different server check (should be false):', differentServer);

    // Test 4: Get stored server ID
    const storedId = await ReauthenticationManager.getStoredServerId();
    console.log('Stored server ID:', storedId);

    // Test 5: Clear specific server
    await ReauthenticationManager.clearReauthenticating('server1');
    const afterClear = await ReauthenticationManager.isReauthenticating('server1');
    console.log('After clearing server1 (should be false):', afterClear);

    // Test 6: Force cleanup
    await ReauthenticationManager.setReauthenticating('server2');
    await ReauthenticationManager.forceCleanup();
    const afterForceCleanup = await ReauthenticationManager.getStoredServerId();
    console.log('After force cleanup (should be null):', afterForceCleanup);

    console.log('All tests completed successfully!');
}

// Run tests if this file is executed directly
if (require.main === module) {
    testReauthenticationManager().catch(console.error);
}

export { testReauthenticationManager };
