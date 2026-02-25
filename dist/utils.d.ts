/**
 * @fileoverview Common Utility Functions
 *
 * Small, pure helper functions used across the sync engine and exposed
 * to consumers via the `stellar-drive/utils` subpath export.
 *
 * All functions in this module are side-effect-free and safe to call in
 * both browser and SSR contexts.
 */
/**
 * Convert a `snake_case` string to a safe `camelCase` identifier.
 *
 * First strips any characters that are not alphanumeric or underscores,
 * then converts underscore-separated words to camelCase.
 *
 * Used internally to derive Dexie (IndexedDB) table names from Supabase
 * snake_case table names.
 *
 * @param s - The snake_case string to convert.
 * @returns The camelCase equivalent.
 *
 * @example
 * snakeToCamel('goal_lists');  // → 'goalLists'
 * snakeToCamel('goals');       // → 'goals'
 * snakeToCamel('my-table!');   // → 'mytable' (invalid chars stripped first)
 */
export declare function snakeToCamel(s: string): string;
/**
 * Generate a UUID v4 (random UUID) using the native Web Crypto API.
 *
 * Suitable for entity primary keys, device IDs, and any context where
 * a universally unique identifier is needed.
 *
 * @returns A lowercase UUID v4 string (e.g., `"550e8400-e29b-41d4-a716-446655440000"`).
 */
export declare function generateId(): string;
/**
 * Get the current timestamp as an ISO 8601 string.
 *
 * Convenience wrapper around `new Date().toISOString()` used as the
 * default value for `created_at`, `updated_at`, and sync operation
 * timestamps throughout the engine.
 *
 * @returns An ISO 8601 timestamp string (e.g., `"2025-01-15T12:30:00.000Z"`).
 */
export declare function now(): string;
/**
 * Calculate a new `order` value when moving an item to a different position.
 *
 * Uses **fractional ordering** so that only the moved item's `order` value
 * changes — no need to re-index the entire list. The new value is placed
 * at the midpoint between its new neighbours.
 *
 * Includes a guard against floating-point precision exhaustion: if the
 * midpoint collapses to either bound, a small epsilon nudge is applied
 * instead. In practice, precision issues only arise after ~50 consecutive
 * moves between the same two items.
 *
 * @typeParam T - Any object with a numeric `order` property.
 * @param items     - The sorted array of items (by `order`, ascending).
 * @param fromIndex - Current index of the item being moved.
 * @param toIndex   - Target index where the item should be placed.
 * @returns The new `order` value for the moved item.
 *
 * @example
 * const items = [{ order: 1 }, { order: 2 }, { order: 3 }];
 * calculateNewOrder(items, 2, 0); // → 0 (before the first item)
 * calculateNewOrder(items, 0, 1); // → 2.5 (between items[1] and items[2])
 */
/**
 * Format a byte count into a human-readable string (B, KB, or MB).
 *
 * @param bytes - Raw byte count
 * @returns Formatted string like `"1.23 KB"` or `"456 B"`
 *
 * @example
 * formatBytes(512);        // → '512 B'
 * formatBytes(2048);       // → '2.00 KB'
 * formatBytes(1572864);    // → '1.50 MB'
 */
export declare function formatBytes(bytes: number): string;
export declare function calculateNewOrder<T extends {
    order: number;
}>(items: T[], fromIndex: number, toIndex: number): number;
/**
 * Create a concurrency guard that prevents overlapping async invocations.
 *
 * Wraps an async function so that if it's called while a previous invocation is
 * still running, the new call is silently skipped (returns `undefined`). This is
 * useful for event-driven handlers (e.g., timer ticks, realtime updates) where
 * overlapping execution would cause race conditions or duplicate work.
 *
 * @typeParam Args - The argument types of the wrapped function.
 * @typeParam R - The return type of the wrapped function.
 * @param fn - The async function to guard against concurrent execution.
 * @returns A wrapped function that skips calls while the previous one is running.
 *
 * @example
 * ```ts
 * const guardedSave = createAsyncGuard(async (data: SavePayload) => {
 *   await api.save(data);
 *   return { saved: true };
 * });
 *
 * // First call executes normally
 * await guardedSave(payload); // → { saved: true }
 *
 * // If called again while the first is still running, returns undefined
 * guardedSave(payload); // → Promise<undefined> (skipped)
 * ```
 */
export declare function createAsyncGuard<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>): (...args: Args) => Promise<R | undefined>;
/**
 * Validates that a redirect path is safe (same-origin, no protocol injection).
 *
 * Prevents open-redirect attacks where an attacker crafts a URL like
 * `/login?redirect=https://evil.com` to phish users post-login.
 *
 * @param path - The redirect path to validate.
 * @returns `true` if the path is a safe relative path.
 *
 * @example
 * isSafeRedirect('/profile');           // → true
 * isSafeRedirect('//evil.com');         // → false
 * isSafeRedirect('https://evil.com');   // → false
 * isSafeRedirect('/login?next=foo');    // → true
 */
export declare function isSafeRedirect(path: string): boolean;
//# sourceMappingURL=utils.d.ts.map