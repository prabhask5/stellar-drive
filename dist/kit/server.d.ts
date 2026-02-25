/**
 * @fileoverview Server-side API helpers for SvelteKit route handlers.
 *
 * This module extracts reusable backend logic so scaffolded API routes can be
 * thin wrappers around these helpers. It provides three main capabilities:
 *
 *   - **Server config reading** — reads Supabase credentials from environment
 *     variables at runtime (`getServerConfig`)
 *   - **Vercel deployment** — upserts env vars and triggers production
 *     redeployments via the Vercel REST API (`deployToVercel`)
 *   - **Credential validation** — factory for a SvelteKit POST handler that
 *     validates Supabase credentials (`createValidateHandler`)
 *
 * All Vercel API interactions use a create-or-update (upsert) strategy for
 * environment variables, and support both git-based and clone-based
 * redeployment strategies for maximum compatibility.
 *
 * @module kit/server
 *
 * @example
 * ```ts
 * // In /api/config/+server.ts
 * import { getServerConfig } from 'stellar-drive/kit/server';
 * export function GET() {
 *   return new Response(JSON.stringify(getServerConfig()));
 * }
 * ```
 *
 * @see {@link https://vercel.com/docs/rest-api} for Vercel API reference
 * @see {@link validateSupabaseCredentials} in `supabase/validate.ts`
 */
import { type SupabaseClient } from '@supabase/supabase-js';
export type { SupabaseClient } from '@supabase/supabase-js';
/**
 * Configuration for deploying Supabase credentials to Vercel.
 *
 * Contains all the information needed to authenticate with Vercel,
 * identify the target project, and set the Supabase connection values.
 */
export interface DeployConfig {
    /** Vercel personal access token or team token for API authentication. */
    vercelToken: string;
    /** The Vercel project ID (found in project settings). */
    projectId: string;
    /** The Supabase project URL (e.g. `https://abc.supabase.co`). */
    supabaseUrl: string;
    /** The Supabase publishable key for client-side access. */
    supabasePublishableKey: string;
    /** Optional table name prefix (e.g. `'switchboard'`). Sets `PUBLIC_APP_PREFIX` env var on Vercel. */
    prefix?: string;
}
/**
 * Result of a Vercel deployment attempt.
 *
 * On success, includes the deployment URL. On failure, includes
 * the error message from the Vercel API or internal exception.
 */
export interface DeployResult {
    /** Whether the env var upsert and redeployment completed without errors. */
    success: boolean;
    /**
     * The Vercel deployment URL for the triggered build.
     * Only present when `success` is `true` and Vercel returns a URL.
     */
    deploymentUrl?: string;
    /**
     * Error message describing what went wrong.
     * Only present when `success` is `false`.
     */
    error?: string;
}
/**
 * Server config status returned by `getServerConfig()`.
 *
 * Indicates whether the required Supabase environment variables are
 * present in the server's runtime environment.
 */
export interface ServerConfig {
    /** `true` when `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` are both set. */
    configured: boolean;
    /** The Supabase project URL, if configured. */
    supabaseUrl?: string;
    /** The Supabase publishable key, if configured. */
    supabasePublishableKey?: string;
}
export declare function getServerConfig(): ServerConfig;
/**
 * Full Vercel deployment flow: upserts Supabase environment variables,
 * then triggers a production redeployment.
 *
 * The deployment uses a two-strategy approach:
 *   - **Strategy A (preferred)**: Git-based redeployment using the repo
 *     metadata from Vercel's environment (`VERCEL_GIT_REPO_SLUG`, etc.).
 *     This triggers a fresh build from the source branch.
 *   - **Strategy B (fallback)**: Clone-based redeployment using an existing
 *     deployment ID (`VERCEL_DEPLOYMENT_ID` or `VERCEL_URL`). This
 *     reuses the last build artifacts with updated env vars.
 *
 * Both strategies target the `production` environment.
 *
 * @param config - The deployment configuration containing Vercel auth
 *                 credentials, project ID, and Supabase connection values.
 *
 * @returns A result object indicating success/failure with an optional
 *          deployment URL or error message.
 *
 * @example
 * ```ts
 * const result = await deployToVercel({
 *   vercelToken: 'tok_...',
 *   projectId: 'prj_...',
 *   supabaseUrl: 'https://abc.supabase.co',
 *   supabasePublishableKey: 'eyJ...'
 * });
 * if (!result.success) console.error(result.error);
 * ```
 *
 * @see {@link DeployConfig} for the input configuration shape
 * @see {@link DeployResult} for the return type shape
 * @see {@link setEnvVar} for the upsert strategy used for env vars
 */
export declare function deployToVercel(config: DeployConfig): Promise<DeployResult>;
/**
 * Factory returning a SvelteKit POST handler that validates Supabase
 * credentials by attempting to connect to the provided Supabase instance.
 *
 * The returned handler:
 *   1. Parses the JSON request body for `supabaseUrl` and `supabasePublishableKey`
 *   2. Validates that both fields are present (returns 400 if not)
 *   3. Delegates to `validateSupabaseCredentials` for the actual check
 *   4. Returns a JSON response with the validation result
 *
 * The `validateSupabaseCredentials` import is dynamic (`await import(...)`)
 * to keep this module's dependency footprint minimal — the validation logic
 * and its Supabase client dependency are only loaded when the endpoint is
 * actually called.
 *
 * @returns An async handler function compatible with SvelteKit's
 *          `RequestHandler` signature for POST endpoints.
 *
 * @example
 * ```ts
 * // In /api/validate-supabase/+server.ts
 * import { createValidateHandler } from 'stellar-drive/kit/server';
 * export const POST = createValidateHandler();
 * ```
 *
 * @see {@link validateSupabaseCredentials} in `supabase/validate.ts`
 */
/**
 * Creates a server-side Supabase client using environment variables.
 *
 * Reads `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
 * from `process.env` via `getServerConfig()` and returns a fresh
 * `SupabaseClient` instance. Intended for use in SvelteKit server hooks
 * or API routes where the browser-side lazy singleton is unavailable.
 *
 * When a `prefix` is provided, the returned client is wrapped in a Proxy
 * that transparently prefixes all `.from()` calls. For example, with
 * `prefix = 'switchboard'`, `.from('gmail_sync_state')` becomes
 * `.from('switchboard_gmail_sync_state')`.
 *
 * @param prefix - Optional table name prefix (e.g. `'switchboard'`).
 *
 * @returns A `SupabaseClient` instance, or `null` if credentials are not configured.
 *
 * @example
 * ```ts
 * // In hooks.server.ts
 * import { createServerSupabaseClient } from 'stellar-drive/kit';
 * const supabase = createServerSupabaseClient('switchboard');
 * // supabase.from('users') → queries 'switchboard_users'
 * ```
 */
export declare function createServerSupabaseClient(prefix?: string): SupabaseClient | null;
/**
 * Factory returning a SvelteKit GET handler that serves the server config
 * with appropriate security headers (Cache-Control, X-Content-Type-Options).
 *
 * @returns An async handler function compatible with SvelteKit's
 *          `RequestHandler` signature for GET endpoints.
 *
 * @example
 * ```ts
 * // In /api/config/+server.ts
 * import { createConfigHandler } from 'stellar-drive/kit';
 * export const GET = createConfigHandler();
 * ```
 */
export declare function createConfigHandler(): () => Promise<Response>;
export declare function createValidateHandler(): ({ request }: {
    request: Request;
}) => Promise<Response>;
//# sourceMappingURL=server.d.ts.map