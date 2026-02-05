/**
 * Factory for the /api/setup/validate POST endpoint.
 *
 * Tests Supabase credentials connectivity.
 */
import { validateSupabaseCredentials } from '../supabase/validate.js';
export function createValidateEndpoint() {
    return async ({ request }) => {
        try {
            const { supabaseUrl, supabaseAnonKey } = await request.json();
            if (!supabaseUrl || !supabaseAnonKey) {
                return new Response(JSON.stringify({ valid: false, error: 'Supabase URL and Anon Key are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            const result = await validateSupabaseCredentials(supabaseUrl, supabaseAnonKey);
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            return new Response(JSON.stringify({ valid: false, error: `Could not connect to Supabase: ${message}` }), { headers: { 'Content-Type': 'application/json' } });
        }
    };
}
//# sourceMappingURL=validateEndpoint.js.map