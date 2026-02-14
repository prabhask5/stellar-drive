/**
 * @fileoverview Vite plugin that generates the service worker and asset manifest
 * at build time. Projects import this instead of maintaining their own SW logic.
 *
 * Usage in vite.config.ts:
 *   import { stellarPWA } from '@prabhask5/stellar-engine/vite';
 *   export default defineConfig({ plugins: [sveltekit(), stellarPWA({ prefix: 'myapp', name: 'My App' })] });
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
// =============================================================================
//                            FILESYSTEM HELPERS
// =============================================================================
/**
 * Recursively collects every file path under `dir`.
 *
 * Used after the build to enumerate all immutable assets so they can be written
 * into the asset manifest consumed by the service worker.
 */
function getAllFiles(dir, files = []) {
    if (!existsSync(dir))
        return files;
    const entries = readdirSync(dir);
    for (const entry of entries) {
        const fullPath = join(dir, entry);
        if (statSync(fullPath).isDirectory()) {
            getAllFiles(fullPath, files);
        }
        else {
            files.push(fullPath);
        }
    }
    return files;
}
/**
 * Locates the compiled SW source (`dist/sw/sw.js`) within the installed package.
 * Works whether the package is installed in node_modules or linked locally.
 */
function findSwSource() {
    // Resolve relative to this file's location in dist/sw/build/vite-plugin.js
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const swPath = join(thisDir, '..', 'sw.js');
    if (existsSync(swPath))
        return swPath;
    // Fallback: use createRequire to resolve from the package
    const require = createRequire(import.meta.url);
    const pkgDir = dirname(require.resolve('@prabhask5/stellar-engine/package.json'));
    return join(pkgDir, 'dist', 'sw', 'sw.js');
}
// =============================================================================
//                           VITE PLUGIN
// =============================================================================
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
export function stellarPWA(config) {
    return {
        name: 'stellar-pwa',
        /* ── buildStart — generate sw.js from compiled source ────────── */
        buildStart() {
            const version = Date.now().toString(36);
            const swSourcePath = findSwSource();
            let swContent = readFileSync(swSourcePath, 'utf-8');
            // Replace placeholder tokens with app-specific values
            swContent = swContent
                .replace(/__SW_VERSION__/g, version)
                .replace(/__SW_PREFIX__/g, config.prefix)
                .replace(/__SW_NAME__/g, config.name);
            // Strip the `export {};` that tsc adds (SW runs as a script, not a module)
            swContent = swContent.replace(/^export\s*\{\s*\}\s*;\s*$/m, '');
            // Ensure static/ directory exists
            const staticDir = resolve('static');
            if (!existsSync(staticDir)) {
                mkdirSync(staticDir, { recursive: true });
            }
            const swPath = resolve('static/sw.js');
            writeFileSync(swPath, swContent);
            console.log(`[stellar-pwa] Generated sw.js (version: ${version})`);
        },
        /* ── closeBundle — generate asset manifest ───────────────────── */
        closeBundle() {
            const buildDir = resolve('.svelte-kit/output/client/_app/immutable');
            if (!existsSync(buildDir)) {
                console.warn('[stellar-pwa] Build directory not found, skipping manifest generation');
                return;
            }
            try {
                const allFiles = getAllFiles(buildDir);
                /**
                 * Only JS and CSS are worth precaching — images/fonts are better
                 * served on-demand via the SW's cache-first strategy.
                 */
                const assets = allFiles
                    .map((f) => f.replace(resolve('.svelte-kit/output/client'), ''))
                    .filter((f) => f.endsWith('.js') || f.endsWith('.css'));
                const manifest = {
                    version: Date.now().toString(36),
                    assets
                };
                const manifestContent = JSON.stringify(manifest, null, 2);
                /* Write to `static/` — available to the dev server and future builds */
                writeFileSync(resolve('static/asset-manifest.json'), manifestContent);
                /* Write to build output — static files are already copied before `closeBundle` runs */
                const buildOutputPath = resolve('.svelte-kit/output/client/asset-manifest.json');
                writeFileSync(buildOutputPath, manifestContent);
                console.log(`[stellar-pwa] Generated asset manifest with ${assets.length} files`);
            }
            catch (e) {
                console.warn('[stellar-pwa] Could not generate asset manifest:', e);
            }
        }
    };
}
//# sourceMappingURL=vite-plugin.js.map