/**
 * Factory for the root +layout.ts load function.
 *
 * Handles config initialization, auth state resolution, and sync engine startup.
 */
import type { AuthMode, OfflineCredentials } from '../types.js';
import type { Session } from '@supabase/supabase-js';
export interface LayoutData {
    session: Session | null;
    authMode: AuthMode;
    offlineProfile: OfflineCredentials | null;
    singleUserSetUp?: boolean;
}
/**
 * Creates the standard layout load function that:
 * 1. Checks if the app is configured (redirects to /setup if not)
 * 2. Resolves auth state
 * 3. Starts the sync engine if authenticated
 */
export declare function createLayoutLoad(): ({ url }: {
    url: URL;
}) => Promise<LayoutData>;
//# sourceMappingURL=layoutLoad.d.ts.map