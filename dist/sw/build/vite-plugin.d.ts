/**
 * @fileoverview Vite plugin that generates the service worker and asset manifest
 * at build time. Projects import this instead of maintaining their own SW logic.
 *
 * Usage in vite.config.ts:
 *   import { stellarPWA } from '@prabhask5/stellar-engine/vite';
 *   export default defineConfig({ plugins: [sveltekit(), stellarPWA({ prefix: 'myapp', name: 'My App' })] });
 */
export interface SWConfig {
    prefix: string;
    name: string;
}
/**
 * Vite plugin that generates `static/sw.js` and `asset-manifest.json` at build time.
 *
 * - **`buildStart` hook**: Reads the compiled SW source from stellar-engine,
 *   replaces placeholder tokens with app-specific values and a unique version
 *   stamp, then writes the final `static/sw.js`.
 *
 * - **`closeBundle` hook**: After Rollup finishes writing chunks, scans the immutable
 *   output directory and writes `asset-manifest.json` listing all JS/CSS files for
 *   the service worker to precache.
 */
export declare function stellarPWA(config: SWConfig): {
    name: string;
    buildStart(): void;
    closeBundle(): void;
};
//# sourceMappingURL=vite-plugin.d.ts.map