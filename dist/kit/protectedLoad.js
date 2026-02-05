/**
 * Factory for the (protected)/+layout.ts load function.
 *
 * Redirects unauthenticated users to /login with return URL.
 */
const DEFAULT_RESULT = {
    session: null,
    authMode: 'none',
    offlineProfile: null
};
export function createProtectedLoad() {
    return async ({ url }) => {
        if (typeof window === 'undefined')
            return DEFAULT_RESULT;
        const { resolveAuthState } = await import('../auth/resolveAuthState.js');
        const result = await resolveAuthState();
        if (result.authMode === 'none') {
            const { redirect } = await import('@sveltejs/kit');
            const returnUrl = url.pathname + url.search;
            const loginUrl = returnUrl && returnUrl !== '/'
                ? `/login?redirect=${encodeURIComponent(returnUrl)}`
                : '/login';
            throw redirect(302, loginUrl);
        }
        return result;
    };
}
//# sourceMappingURL=protectedLoad.js.map