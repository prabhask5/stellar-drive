/**
 * Factory for the /api/setup/deploy POST endpoint.
 *
 * Sets Supabase environment variables in Vercel and triggers a redeployment.
 */
interface AdditionalEnvVar {
    /** Key in the request body JSON */
    bodyKey: string;
    /** Vercel environment variable name */
    envKey: string;
    /** Vercel env var type: 'plain' (default) or 'encrypted' */
    type?: 'plain' | 'encrypted';
}
interface DeployEndpointOptions {
    /** Additional environment variables to set from the request body. */
    additionalEnvVars?: AdditionalEnvVar[];
}
export declare function createDeployEndpoint(options?: DeployEndpointOptions): ({ request }: {
    request: Request;
}) => Promise<Response>;
export {};
//# sourceMappingURL=deployEndpoint.d.ts.map