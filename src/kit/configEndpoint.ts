/**
 * Factory for the /api/config GET endpoint.
 *
 * Returns Supabase URL and anon key from environment variables.
 * Optionally checks additional env vars (e.g., SMTP config).
 */

interface ConfigEndpointOptions {
  /** Additional environment variables to check and include in the response. */
  extraChecks?: Array<{
    /** Key to use in the JSON response */
    responseKey: string;
    /** Environment variable names to check — all must be set for the check to pass */
    envKeys: string[];
  }>;
}

export function createConfigEndpoint(options?: ConfigEndpointOptions) {
  return async () => {
    const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';

    const extras: Record<string, boolean> = {};
    if (options?.extraChecks) {
      for (const check of options.extraChecks) {
        extras[check.responseKey] = check.envKeys.every((k) => !!(process.env[k]));
      }
    }

    if (supabaseUrl && supabaseAnonKey) {
      return new Response(
        JSON.stringify({ configured: true, supabaseUrl, supabaseAnonKey, ...extras }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const falseExtras: Record<string, boolean> = {};
    for (const key of Object.keys(extras)) {
      falseExtras[key] = false;
    }

    return new Response(
      JSON.stringify({ configured: false, ...falseExtras }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  };
}
