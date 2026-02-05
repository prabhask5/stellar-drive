/**
 * Factory for the root +layout.ts load function.
 *
 * Handles config initialization, auth state resolution, and sync engine startup.
 */
const DEFAULT_RESULT = {
    session: null,
    authMode: 'none',
    offlineProfile: null,
    singleUserSetUp: false
};
/**
 * Creates the standard layout load function that:
 * 1. Checks if the app is configured (redirects to /setup if not)
 * 2. Resolves auth state
 * 3. Starts the sync engine if authenticated
 */
export function createLayoutLoad() {
    return async ({ url }) => {
        if (typeof window === 'undefined')
            return DEFAULT_RESULT;
        // Dynamic imports to avoid SSR issues
        const { initConfig } = await import('../runtime/runtimeConfig.js');
        const { resolveAuthState } = await import('../auth/resolveAuthState.js');
        const { startSyncEngine } = await import('../engine.js');
        const config = await initConfig();
        if (!config && url.pathname !== '/setup') {
            const { redirect } = await import('@sveltejs/kit');
            throw redirect(307, '/setup');
        }
        if (!config) {
            return DEFAULT_RESULT;
        }
        const result = await resolveAuthState();
        if (result.authMode !== 'none') {
            await startSyncEngine();
        }
        return result;
    };
}
//# sourceMappingURL=layoutLoad.js.map