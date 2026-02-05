/**
 * Vercel API utilities for deploy endpoints.
 */
export async function vercelApi(path, token, method = 'GET', body) {
    const res = await fetch(`https://api.vercel.com${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    return res;
}
export async function setEnvVar(projectId, token, key, value, envType = 'plain') {
    const createRes = await vercelApi(`/v10/projects/${projectId}/env`, token, 'POST', {
        key,
        value,
        target: ['production', 'preview', 'development'],
        type: envType
    });
    if (createRes.ok)
        return;
    const createData = await createRes.json();
    const errorCode = createData.error?.code || '';
    const errorMessage = createData.error?.message || '';
    if (errorCode === 'ENV_ALREADY_EXISTS' || errorMessage.includes('already exists')) {
        const listRes = await vercelApi(`/v9/projects/${projectId}/env`, token);
        if (!listRes.ok) {
            throw new Error(`Failed to list env vars: ${listRes.statusText}`);
        }
        const listData = await listRes.json();
        const existing = listData.envs?.find((e) => e.key === key);
        if (existing) {
            const updateRes = await vercelApi(`/v9/projects/${projectId}/env/${existing.id}`, token, 'PATCH', { value });
            if (!updateRes.ok) {
                throw new Error(`Failed to update env var ${key}: ${updateRes.statusText}`);
            }
        }
        else {
            throw new Error(`Env var ${key} reported as existing but not found in list`);
        }
    }
    else {
        throw new Error(`Failed to create env var ${key}: ${createData.error?.message || createRes.statusText}`);
    }
}
//# sourceMappingURL=vercelApi.js.map