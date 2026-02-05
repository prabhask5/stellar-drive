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
export declare function createConfigEndpoint(options?: ConfigEndpointOptions): () => Promise<Response>;
export {};
//# sourceMappingURL=configEndpoint.d.ts.map