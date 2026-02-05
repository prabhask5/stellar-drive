/**
 * Factory for the (protected)/+layout.ts load function.
 *
 * Redirects unauthenticated users to /login with return URL.
 */
import type { AuthMode, OfflineCredentials } from '../types.js';
import type { Session } from '@supabase/supabase-js';
export interface ProtectedLayoutData {
    session: Session | null;
    authMode: AuthMode;
    offlineProfile: OfflineCredentials | null;
}
export declare function createProtectedLoad(): ({ url }: {
    url: URL;
}) => Promise<ProtectedLayoutData>;
//# sourceMappingURL=protectedLoad.d.ts.map