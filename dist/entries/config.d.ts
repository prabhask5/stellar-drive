/**
 * @fileoverview Config subpath barrel — `stellar-drive/config`
 *
 * Provides runtime configuration management for the application. The config
 * system allows apps to store, retrieve, and update key-value settings that
 * persist across sessions (e.g. theme preference, feature flags, locale).
 *
 * - `initConfig` — initializes the config store with default values on app boot.
 * - `getConfig` — retrieves the current configuration snapshot.
 * - `setConfig` — merges partial updates into the active configuration.
 * - `AppConfig` — TypeScript interface describing the configuration shape.
 */
export { initConfig, getConfig, setConfig, probeNetworkReachability, isOffline, setOfflineFlag } from '../runtime/runtimeConfig';
export type { AppConfig } from '../runtime/runtimeConfig';
export { initEngine } from '../config';
export type { SyncEngineConfig, TableConfig, InitEngineInput } from '../config';
export { supabase } from '../supabase/client';
export { getDb, resetDatabase } from '../database';
//# sourceMappingURL=config.d.ts.map