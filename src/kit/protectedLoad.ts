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

const DEFAULT_RESULT: ProtectedLayoutData = {
  session: null,
  authMode: 'none',
  offlineProfile: null
};

export function createProtectedLoad() {
  return async ({ url }: { url: URL }): Promise<ProtectedLayoutData> => {
    if (typeof window === 'undefined') return DEFAULT_RESULT;

    const { resolveAuthState } = await import('../auth/resolveAuthState.js');
    const result = await resolveAuthState();

    if (result.authMode === 'none') {
      const { redirect } = await import('@sveltejs/kit');
      const returnUrl = url.pathname + url.search;
      const loginUrl =
        returnUrl && returnUrl !== '/'
          ? `/login?redirect=${encodeURIComponent(returnUrl)}`
          : '/login';
      throw redirect(302, loginUrl);
    }

    return result;
  };
}
