/**
 * Vercel API utilities for deploy endpoints.
 */
export declare function vercelApi(path: string, token: string, method?: string, body?: unknown): Promise<Response>;
export declare function setEnvVar(projectId: string, token: string, key: string, value: string, envType?: string): Promise<void>;
//# sourceMappingURL=vercelApi.d.ts.map