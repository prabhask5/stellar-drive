/**
 * Factory for the /setup +page.ts load function.
 *
 * Access control: if unconfigured, allow anyone. If configured, require admin.
 */

export function createSetupLoad() {
  return async () => {
    if (typeof window === 'undefined') return {};

    const { getConfig } = await import('../runtime/runtimeConfig.js');
    const { getValidSession } = await import('../supabase/auth.js');

    if (!getConfig()) {
      return { isFirstSetup: true };
    }

    const session = await getValidSession();
    if (!session?.user) {
      const { redirect } = await import('@sveltejs/kit');
      throw redirect(307, '/login');
    }

    const { isAdmin } = await import('../auth/admin.js');
    if (!isAdmin(session.user)) {
      const { redirect } = await import('@sveltejs/kit');
      throw redirect(307, '/');
    }

    return { isFirstSetup: false };
  };
}
