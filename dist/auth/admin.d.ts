/**
 * Admin Check
 *
 * Delegates to config.auth.adminCheck or returns false.
 */
import type { User } from '@supabase/supabase-js';
/**
 * Check if a user has admin privileges.
 * Uses the adminCheck function from engine config if provided.
 */
export declare function isAdmin(user: User | null): boolean;
//# sourceMappingURL=admin.d.ts.map