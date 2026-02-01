/**
 * Auth State Resolution
 *
 * Determines the current authentication state by checking Supabase session,
 * offline session, and cached credentials. Used by app layouts to determine
 * whether user is authenticated and in which mode.
 */
import { getSession, isSessionExpired } from '../supabase/auth';
import { getValidOfflineSession, clearOfflineSession } from './offlineSession';
import { getOfflineCredentials } from './offlineCredentials';
import { debugWarn, debugError } from '../debug';
/**
 * Resolve the current authentication state.
 *
 * - Online: check Supabase session validity
 * - Offline: check localStorage session, fallback to offline session + credential matching
 * - Handles corrupted state cleanup
 * - Does NOT start sync engine (caller decides)
 */
export async function resolveAuthState() {
    try {
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        // Get session once and reuse (egress optimization)
        const session = await getSession();
        const hasValidSession = session && !isSessionExpired(session);
        // ONLINE: Always use Supabase authentication
        if (!isOffline) {
            if (hasValidSession) {
                return { session, authMode: 'supabase', offlineProfile: null };
            }
            // No valid Supabase session while online - user needs to login
            return { session: null, authMode: 'none', offlineProfile: null };
        }
        // OFFLINE: Try Supabase session from localStorage first, then offline session
        if (hasValidSession) {
            return { session, authMode: 'supabase', offlineProfile: null };
        }
        // No valid Supabase session - check for offline session
        const offlineSession = await getValidOfflineSession();
        if (offlineSession) {
            // SECURITY: Verify offline session matches cached credentials
            const profile = await getOfflineCredentials();
            if (profile && profile.userId === offlineSession.userId) {
                return { session: null, authMode: 'offline', offlineProfile: profile };
            }
            // Mismatch: credentials changed after session created
            debugWarn('[Auth] Offline session userId does not match credentials - clearing session');
            await clearOfflineSession();
        }
        // No valid session while offline
        return { session: null, authMode: 'none', offlineProfile: null };
    }
    catch (e) {
        // If session retrieval fails completely (corrupted auth state),
        // clear all Supabase auth data and return no session
        debugError('[Auth] Failed to resolve auth state, clearing auth storage:', e);
        try {
            if (typeof localStorage !== 'undefined') {
                const keys = Object.keys(localStorage).filter((k) => k.startsWith('sb-'));
                keys.forEach((k) => localStorage.removeItem(k));
            }
        }
        catch {
            // Ignore storage errors
        }
        return { session: null, authMode: 'none', offlineProfile: null };
    }
}
//# sourceMappingURL=resolveAuthState.js.map