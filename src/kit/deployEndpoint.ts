/**
 * Factory for the /api/setup/deploy POST endpoint.
 *
 * Sets Supabase environment variables in Vercel and triggers a redeployment.
 */

import { vercelApi, setEnvVar } from './vercelApi.js';

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

export function createDeployEndpoint(options?: DeployEndpointOptions) {
  return async ({ request }: { request: Request }) => {
    try {
      const body = await request.json();
      const { supabaseUrl, supabaseAnonKey, vercelToken } = body;

      if (!supabaseUrl || !supabaseAnonKey || !vercelToken) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Supabase URL, Anon Key, and Vercel Token are required'
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const projectId = process.env.VERCEL_PROJECT_ID;
      if (!projectId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'VERCEL_PROJECT_ID not found. This endpoint only works on Vercel deployments.'
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Set core env vars
      await setEnvVar(projectId, vercelToken, 'PUBLIC_SUPABASE_URL', supabaseUrl);
      await setEnvVar(
        projectId,
        vercelToken,
        'PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
        supabaseAnonKey
      );

      // Set additional env vars if provided
      if (options?.additionalEnvVars) {
        for (const envVar of options.additionalEnvVars) {
          const value = body[envVar.bodyKey];
          if (value !== undefined && value !== null && value !== '') {
            await setEnvVar(
              projectId,
              vercelToken,
              envVar.envKey,
              String(value),
              envVar.type || 'plain'
            );
          }
        }
      }

      // Trigger redeployment
      const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL;
      const gitRepo = process.env.VERCEL_GIT_REPO_SLUG;
      const gitOwner = process.env.VERCEL_GIT_REPO_OWNER;
      const gitRef = process.env.VERCEL_GIT_COMMIT_REF || 'main';

      let deploymentUrl = '';

      if (gitRepo && gitOwner) {
        const deployRes = await vercelApi(`/v13/deployments`, vercelToken, 'POST', {
          name: projectId,
          project: projectId,
          target: 'production',
          gitSource: {
            type: 'github',
            repoId: `${gitOwner}/${gitRepo}`,
            ref: gitRef
          }
        });

        if (deployRes.ok) {
          const deployData = await deployRes.json();
          deploymentUrl = deployData.url || '';
        }
      }

      if (!deploymentUrl && deploymentId) {
        const redeployRes = await vercelApi(`/v13/deployments`, vercelToken, 'POST', {
          name: projectId,
          project: projectId,
          target: 'production',
          deploymentId
        });

        if (redeployRes.ok) {
          const redeployData = await redeployRes.json();
          deploymentUrl = redeployData.url || '';
        }
      }

      return new Response(
        JSON.stringify({ success: true, deploymentUrl }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      return new Response(
        JSON.stringify({ success: false, error: message }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}
