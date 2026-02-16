# @prabhask5/stellar-engine [![npm version](https://img.shields.io/npm/v/@prabhask5/stellar-engine.svg?style=flat)](https://www.npmjs.com/package/@prabhask5/stellar-engine) [![Made with Supabase](https://supabase.com/badge-made-with-supabase-dark.svg)](https://supabase.com)

An offline-first, real-time sync engine for **Supabase + Dexie.js** applications. All reads come from IndexedDB, all writes land locally first, and a background sync loop ships changes to Supabase -- so your app stays fast and functional regardless of network state. Optional SvelteKit integrations are included for teams building with Svelte 5.

## Documentation

- [API Reference](./API_REFERENCE.md) -- full signatures, parameters, and usage examples for every public export
- [Architecture](./ARCHITECTURE.md) -- internal design, data flow, and module responsibilities
- [Frameworks](./FRAMEWORKS.md) -- More reading on
frameworks used in stellar-engine

## Features

- **Schema-driven configuration** -- declare tables once and the engine auto-generates Dexie stores, database versioning, TypeScript interfaces, and Supabase SQL
- **Intent-based sync operations** -- operations preserve intent (`increment`, `set`, `create`, `delete`) instead of final state, enabling smarter coalescing and conflict handling
- **6-step operation coalescing** -- 50 rapid writes are compressed into 1 outbound operation, dramatically reducing sync traffic
- **Three-tier conflict resolution** -- field-level auto-merge for non-overlapping changes, different-field merge, and same-field resolution (`local_pending` > `delete_wins` > `last_write_wins` with device ID tiebreaker)
- **Offline authentication** -- SHA-256 credential caching and offline session tokens let users sign in and work without connectivity; sessions reconcile automatically on reconnect
- **Single-user PIN/password auth** -- simplified gate backed by real Supabase email/password auth; PIN is padded to meet minimum length and verified server-side
- **Device verification** -- email OTP for untrusted devices with 90-day trust duration
- **Realtime subscriptions** -- Supabase Realtime WebSocket push with echo suppression and deduplication against polling
- **Tombstone management** -- soft deletes with configurable garbage collection
- **Egress optimization** -- column-level selects, operation coalescing, push-only mode when realtime is healthy, cursor-based pulls
- **CRDT collaborative editing** -- optional Yjs-based subsystem for real-time multi-user editing via Supabase Broadcast
- **Demo mode** -- sandboxed database, zero Supabase connections, mock auth for instant onboarding experiences
- **Reactive stores** -- Svelte-compatible stores for sync status, auth state, network state, and remote changes
- **Store factories** -- `createCollectionStore` and `createDetailStore` for boilerplate-free reactive data layers
- **Svelte actions** -- `remoteChangeAnimation`, `trackEditing`, `triggerLocalAnimation` for declarative UI behavior
- **SQL generation** -- auto-generate `CREATE TABLE` statements, RLS policies, and migrations from your schema config
- **TypeScript generation** -- auto-generate interfaces from schema
- **Diagnostics** -- comprehensive runtime diagnostics covering sync, queue, realtime, conflicts, egress, and network
- **Debug utilities** -- opt-in debug logging and `window` debug utilities for browser console inspection
- **SvelteKit integration** (optional) -- layout helpers, server handlers, email confirmation, service worker lifecycle, and auth hydration
- **PWA scaffolding CLI** -- `stellar-engine install pwa` generates a complete SvelteKit PWA project (34+ files)

### Use cases

- Productivity and task management apps
- Notion-like block editors (with CRDT collaborative editing)
- Personal finance trackers (numeric merge across devices)
- File and asset management UIs (fractional ordering for drag-and-drop)
- Habit trackers and daily planners
- Knowledge bases and note-taking apps
- Any app needing offline-first multi-device sync

## Quick start

```ts
// ─── Install ───────────────────────────────────────────────────────
// npm install @prabhask5/stellar-engine

// ─── 1. Initialize the engine ──────────────────────────────────────
// Call once at app startup (e.g., root layout, main entry point)

import {
  initEngine,
  startSyncEngine,
  supabase,
  getDb,
  resetDatabase,
  validateSupabaseCredentials,
  validateSchema,
} from '@prabhask5/stellar-engine';
import { initConfig } from '@prabhask5/stellar-engine/config';
import { resolveAuthState } from '@prabhask5/stellar-engine/auth';

initEngine({
  prefix: 'myapp',
  supabase,
  // Schema-driven: declare tables once, engine handles the rest
  tables: [
    {
      supabaseName: 'projects',                       // Supabase table name
      // Dexie name auto-derived: 'projects'
      columns: 'id, name, description, sort_order, created_at, updated_at, is_deleted, user_id',
      ownershipFilter: 'user_id',                     // RLS-aware egress filter
      mergeFields: [],                                // Fields for numeric merge
      excludeFromConflictResolution: ['updated_at'],  // Fields to skip in conflict diffing
    },
    {
      supabaseName: 'tasks',
      columns: 'id, title, project_id, count, sort_order, created_at, updated_at, is_deleted, user_id',
      ownershipFilter: 'user_id',
      mergeFields: ['count'],                          // Numeric merge: concurrent increments add up
    },
  ],

  // Declarative database versioning -- system tables (syncQueue, conflictHistory,
  // offlineCredentials, offlineSession, singleUserConfig) are auto-merged
  database: {
    name: 'MyAppDB',
    versions: [
      {
        version: 1,
        stores: {
          projects: 'id, user_id, updated_at',
          tasks: 'id, project_id, user_id, updated_at',
        },
      },
    ],
  },

  // Auth config -- single-user mode with 4-digit PIN
  auth: {
    singleUser: { gateType: 'code', codeLength: 4 },
    enableOfflineAuth: true,
    // emailConfirmation: { enabled: true },
    // deviceVerification: { enabled: true },
  },

  // Demo mode config (optional)
  demo: {
    seedData: async (db) => {
      await db.table('projects').bulkPut([
        { id: 'demo-1', name: 'Sample Project', sort_order: 1, is_deleted: false },
      ]);
    },
    mockProfile: { email: 'demo@example.com', firstName: 'Demo', lastName: 'User' },
  },

  // CRDT config (optional)
  crdt: {
    persistIntervalMs: 30000,
    maxOfflineDocuments: 50,
  },
});

// ─── 2. Resolve auth and start the engine ──────────────────────────

await initConfig();
const auth = await resolveAuthState();

if (!auth.singleUserSetUp) {
  // First-time setup flow
  // → call setupSingleUser(code, profile, email) from your UI
} else if (auth.authMode === 'none') {
  // Locked -- show unlock screen
  // → call unlockSingleUser(code) from your UI
} else {
  // Authenticated -- start syncing
  await startSyncEngine();
}

// ─── 3. CRUD operations ────────────────────────────────────────────

import {
  engineCreate,
  engineUpdate,
  engineDelete,
  engineIncrement,
  engineBatchWrite,
  queryAll,
  queryOne,
  engineGetOrCreate,
} from '@prabhask5/stellar-engine/data';
import { generateId, now } from '@prabhask5/stellar-engine/utils';

// Create
const projectId = generateId();
await engineCreate('projects', {
  id: projectId,
  name: 'New Project',
  sort_order: 1,
  created_at: now(),
  updated_at: now(),
  is_deleted: false,
  user_id: 'current-user-id',
});

// Update (only changed fields are synced)
await engineUpdate('tasks', taskId, {
  title: 'Updated title',
  updated_at: now(),
});

// Delete (soft delete -- tombstone managed by engine)
await engineDelete('tasks', taskId);

// Increment (intent-preserved -- concurrent increments merge correctly)
await engineIncrement('tasks', taskId, 'count', 1);

// Query all rows from local IndexedDB
const projects = await queryAll('projects');

// Query a single row
const project = await queryOne('projects', projectId);

// Get or create (atomic upsert)
const { record, created } = await engineGetOrCreate('projects', projectId, {
  id: projectId,
  name: 'Default Project',
  sort_order: 0,
  created_at: now(),
  updated_at: now(),
  is_deleted: false,
  user_id: 'current-user-id',
});

// Batch writes (multiple operations in one sync push)
await engineBatchWrite([
  { type: 'create', table: 'tasks', data: { id: generateId(), title: 'Task 1', project_id: projectId, count: 0, sort_order: 1, created_at: now(), updated_at: now(), is_deleted: false, user_id: 'current-user-id' } },
  { type: 'create', table: 'tasks', data: { id: generateId(), title: 'Task 2', project_id: projectId, count: 0, sort_order: 2, created_at: now(), updated_at: now(), is_deleted: false, user_id: 'current-user-id' } },
  { type: 'update', table: 'projects', id: projectId, data: { updated_at: now() } },
]);

// ─── 4. Reactive store factories ───────────────────────────────────

import { createCollectionStore, createDetailStore } from '@prabhask5/stellar-engine/stores';

// Collection store -- live-updating list from IndexedDB
const projectsStore = createCollectionStore('projects', {
  filter: (p) => !p.is_deleted,
  sort: (a, b) => a.sort_order - b.sort_order,
});
// Subscribe: projectsStore.subscribe(items => { ... })

// Detail store -- single record by ID
const projectDetail = createDetailStore('projects', projectId);
// Subscribe: projectDetail.subscribe(record => { ... })

// ─── 5. Reactive stores ───────────────────────────────────────────

import {
  syncStatusStore,
  authState,
  isOnline,
  remoteChangesStore,
  onSyncComplete,
} from '@prabhask5/stellar-engine/stores';

// Listen for sync completions
onSyncComplete(() => {
  console.log('Sync cycle finished');
});

// ─── 6. CRDT collaborative editing ────────────────────────────────

import {
  openDocument,
  closeDocument,
  createSharedText,
  createBlockDocument,
  updateCursor,
  getCollaborators,
  onCollaboratorsChange,
} from '@prabhask5/stellar-engine/crdt';

// Open a collaborative document (uses Supabase Broadcast -- zero DB writes per keystroke)
const provider = await openDocument('doc-1', 'page-1', {
  offlineEnabled: true,
  initialPresence: { name: 'Alice' },
});

// Use with any Yjs-compatible editor (Tiptap, BlockNote, etc.)
const { content, meta } = createBlockDocument(provider.doc);
meta.set('title', 'My Page');

// Track collaborator cursors and presence
const unsub = onCollaboratorsChange('doc-1', (collaborators) => {
  // Update avatar list, cursor positions, etc.
});

await closeDocument('doc-1');

// ─── 7. Demo mode ─────────────────────────────────────────────────

import { setDemoMode } from '@prabhask5/stellar-engine';

// Toggle demo mode (requires full page reload)
setDemoMode(true);
window.location.href = '/';

// In demo mode:
// - Uses '${name}_demo' IndexedDB (real DB never opened)
// - Zero Supabase network requests
// - authMode === 'demo', protected routes work with mock data
// - seedData callback runs on each page load

// ─── 8. Diagnostics and debug ──────────────────────────────────────

import {
  setDebugMode,
  isDebugMode,
  getSyncDiagnostics,
  getQueueDiagnostics,
  getRealtimeDiagnostics,
  getConflictDiagnostics,
  getEgressDiagnostics,
  getNetworkDiagnostics,
} from '@prabhask5/stellar-engine/utils';

setDebugMode(true);

// Runtime diagnostics
const syncInfo = getSyncDiagnostics();
const queueInfo = getQueueDiagnostics();
const egressInfo = getEgressDiagnostics();

// ─── 9. SQL and TypeScript generation ──────────────────────────────

import {
  generateCreateTableSQL,
  generateRLSPolicies,
  generateTypeScriptInterfaces,
} from '@prabhask5/stellar-engine/utils';

// Auto-generate Supabase SQL from your schema config
const sql = generateCreateTableSQL('projects', tableConfig);
const rls = generateRLSPolicies('projects', tableConfig);
const tsInterfaces = generateTypeScriptInterfaces(allTables);
```

## Commands

### Install PWA

Scaffold a complete offline-first SvelteKit PWA project with an interactive walkthrough:

```bash
npx @prabhask5/stellar-engine install pwa
```

The wizard prompts for:

| Prompt | Required | Description |
|--------|----------|-------------|
| App Name | Yes | Full app name (e.g., "Stellar Planner") |
| Short Name | Yes | Short name for PWA home screen (under 12 chars) |
| Prefix | Yes | Lowercase key for localStorage, caches, SW (auto-suggested from name) |
| Description | No | App description (default: "A self-hosted offline-first PWA") |

Generates **34+ files** for a production-ready SvelteKit 2 + Svelte 5 project:

- **Config files (8):** `vite.config.ts`, `tsconfig.json`, `svelte.config.js`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `knip.json`, `.gitignore`
- **Documentation (3):** `README.md`, `ARCHITECTURE.md`, `FRAMEWORKS.md`
- **Static assets (13):** `manifest.json`, `offline.html`, placeholder SVG icons, email template placeholders
- **Database (1):** `supabase-schema.sql` with helper functions, example tables, and `trusted_devices` table
- **Source files (2):** `src/app.html` (PWA-ready with iOS meta tags, SW registration), `src/app.d.ts`
- **Route files (16):** Root layout, login, setup, profile, protected area, API endpoints, catch-all redirect
- **Library (1):** `src/lib/types.ts` with re-exports and app-specific type stubs
- **Git hooks (1):** `.husky/pre-commit` with lint + format + validate

### Setup

Validate Supabase credentials and schema against a running project:

```bash
npx @prabhask5/stellar-engine setup
```

## API overview

### Engine Configuration and Lifecycle

| Export | Description |
|---|---|
| `initEngine(config)` | Initialize the engine with table definitions, auth, database, and optional CRDT/demo config |
| `startSyncEngine()` | Start the sync loop, realtime subscriptions, and event listeners |
| `stopSyncEngine()` | Tear down sync loop and subscriptions cleanly |
| `runFullSync()` | Run a complete pull-then-push cycle |
| `scheduleSyncPush()` | Trigger a debounced push of pending operations |
| `getEngineConfig()` | Retrieve the current engine config (throws if not initialized) |
| `validateSupabaseCredentials()` | Verify Supabase URL and anon key are valid |
| `validateSchema()` | Validate all configured tables exist in Supabase |

### Database

| Export | Description |
|---|---|
| `supabase` | The configured `SupabaseClient` instance |
| `getDb()` | Get the Dexie database instance |
| `resetDatabase()` | Drop and recreate the local IndexedDB database |
| `clearLocalCache()` | Wipe all local application data |
| `clearPendingSyncQueue()` | Drop all pending outbound operations |
| `getSupabaseAsync()` | Async getter that waits for initialization |
| `resetSupabaseClient()` | Tear down and reinitialize the Supabase client |

### CRUD and Query Operations

| Export | Description |
|---|---|
| `engineCreate(table, data)` | Create a record locally and enqueue sync |
| `engineUpdate(table, id, data)` | Update specific fields locally and enqueue sync |
| `engineDelete(table, id)` | Soft-delete a record (tombstone) |
| `engineIncrement(table, id, field, delta)` | Intent-preserving numeric increment |
| `engineBatchWrite(operations)` | Execute multiple operations in a single sync push |
| `engineGetOrCreate(table, id, defaults)` | Atomic get-or-create (upsert) |
| `queryAll(table, options?)` | Query all rows from local IndexedDB |
| `queryOne(table, id)` | Query a single row by ID |
| `markEntityModified(table, id)` | Suppress incoming realtime overwrites for a recently modified entity |

### Authentication -- Core

| Export | Description |
|---|---|
| `resolveAuthState()` | Determine current auth state (online, offline, or none) |
| `signOut()` | Full teardown: stop sync, clear caches, sign out of Supabase |
| `getValidSession()` | Get a non-expired Supabase session, or `null` |
| `verifyOtp(tokenHash)` | Verify OTP token hash from email confirmation links |
| `resendConfirmationEmail()` | Resend signup confirmation email |
| `getUserProfile()` | Read profile from Supabase user metadata |
| `updateProfile(data)` | Write profile to Supabase user metadata |

### Authentication -- Single-User

| Export | Description |
|---|---|
| `setupSingleUser(gate, profile, email)` | First-time setup: create gate, Supabase user, and store config |
| `unlockSingleUser(gate)` | Verify gate and restore session (online or offline) |
| `lockSingleUser()` | Stop sync and reset auth state without destroying data |
| `isSingleUserSetUp()` | Check if initial setup is complete |
| `getSingleUserInfo()` | Get display info (profile, gate type) for the unlock screen |
| `changeSingleUserGate(oldGate, newGate)` | Change PIN code or password |
| `updateSingleUserProfile(profile)` | Update profile in IndexedDB and Supabase metadata |
| `changeSingleUserEmail(newEmail)` | Request email change |
| `completeSingleUserEmailChange()` | Finalize email change after confirmation |
| `resetSingleUser()` | Full reset: clear config, sign out, wipe local data |
| `padPin(pin)` | Pad a PIN to meet Supabase's minimum password length |

### Authentication -- Device Verification

| Export | Description |
|---|---|
| `completeDeviceVerification(tokenHash?)` | Complete device OTP verification |
| `sendDeviceVerification()` | Send device verification email |
| `pollDeviceVerification()` | Poll for device verification completion |
| `linkSingleUserDevice()` | Link current device to user after verification |
| `getTrustedDevices()` | List all trusted devices for current user |
| `removeTrustedDevice(deviceId)` | Remove a trusted device |
| `getCurrentDeviceId()` | Get the stable device identifier |
| `fetchRemoteGateConfig()` | Fetch gate config from Supabase for cross-device setup |

### Authentication -- Display Utilities

| Export | Description |
|---|---|
| `resolveFirstName(session, offline, fallback?)` | Resolve display name from session or offline profile |
| `resolveUserId(session, offline)` | Extract user UUID from session or offline credentials |
| `resolveAvatarInitial(session, offline, fallback?)` | Single uppercase initial for avatar display |

### Reactive Stores

| Export | Description |
|---|---|
| `syncStatusStore` | Current `SyncStatus`, last sync time, and errors |
| `authState` | Reactive auth state object (`mode`, `session`, `offlineProfile`, `isLoading`) |
| `isAuthenticated` | Derived boolean for auth status |
| `userDisplayInfo` | Derived display name and avatar info |
| `isOnline` | Reactive boolean reflecting network state |
| `remoteChangesStore` | Tracks entities recently changed by remote peers |
| `createRecentChangeIndicator(table, id)` | Derived indicator for UI highlighting of remote changes |
| `createPendingDeleteIndicator(table, id)` | Derived indicator for entities awaiting delete confirmation |
| `onSyncComplete(callback)` | Register a callback invoked after each successful sync cycle |
| `onRealtimeDataUpdate(callback)` | Register a handler for incoming realtime changes |

### Store Factories

| Export | Description |
|---|---|
| `createCollectionStore(table, options?)` | Live-updating list store from IndexedDB with filter and sort |
| `createDetailStore(table, id)` | Single-record store by ID |

### Realtime

| Export | Description |
|---|---|
| `startRealtimeSubscriptions()` | Start Supabase Realtime channels for all configured tables |
| `stopRealtimeSubscriptions()` | Stop all Realtime channels |
| `isRealtimeHealthy()` | Realtime connection health check |
| `wasRecentlyProcessedByRealtime(table, id)` | Guard against duplicate processing |

### Runtime Config

| Export | Description |
|---|---|
| `initConfig()` | Initialize runtime configuration |
| `getConfig()` | Get current config |
| `setConfig(config)` | Update runtime config |
| `waitForConfig()` | Async getter that waits for config initialization |
| `isConfigured()` | Check if config is initialized |
| `clearConfigCache()` | Clear cached config |
| `getDexieTableFor(supabaseName)` | Get the Dexie table name for a Supabase table name |

### Diagnostics and Debug

| Export | Description |
|---|---|
| `getSyncDiagnostics()` | Sync cycle statistics and recent cycle details |
| `getQueueDiagnostics()` | Pending operation queue state |
| `getRealtimeDiagnostics()` | Realtime connection state and health |
| `getConflictDiagnostics()` | Conflict resolution history and stats |
| `getEgressDiagnostics()` | Data transfer from Supabase (bytes, per-table breakdown) |
| `getNetworkDiagnostics()` | Network state and connectivity info |
| `setDebugMode(enabled)` | Enable/disable debug logging |
| `isDebugMode()` | Check if debug mode is active |
| `debugLog` / `debugWarn` / `debugError` | Prefixed console helpers (gated by debug mode) |

When debug mode is enabled, the engine exposes utilities on `window` using your configured prefix (e.g., `window.__myappSyncStats()`, `window.__myappEgress()`, `window.__myappTombstones()`, `window.__myappSync.forceFullSync()`).

### Utilities

| Export | Description |
|---|---|
| `generateId()` | Generate a UUID |
| `now()` | Current ISO timestamp string |
| `calculateNewOrder(before, after)` | Fractional ordering helper for drag-and-drop reorder |
| `snakeToCamel(str)` | Convert `snake_case` to `camelCase` |
| `getDeviceId()` | Stable per-device identifier (persisted in localStorage) |

### SQL and TypeScript Generation

| Export | Description |
|---|---|
| `generateCreateTableSQL(name, config)` | Generate `CREATE TABLE` statement from schema config |
| `generateRLSPolicies(name, config)` | Generate Row-Level Security policies |
| `generateTypeScriptInterfaces(tables)` | Generate TypeScript interfaces from all table configs |

### Svelte Actions

| Export | Description |
|---|---|
| `remoteChangeAnimation` | `use:` action that animates an element when a remote change arrives |
| `trackEditing` | Action that signals the engine a field is being actively edited (suppresses incoming overwrites) |
| `triggerLocalAnimation` | Programmatically trigger the local-change animation on a node |
| `truncateTooltip` | Action that shows a tooltip with full text when content is truncated |

### Svelte Components

| Export | Description |
|---|---|
| `@prabhask5/stellar-engine/components/SyncStatus` | Animated sync-state indicator with tooltip and PWA refresh (offline/syncing/synced/error/pending states) |
| `@prabhask5/stellar-engine/components/DeferredChangesBanner` | Cross-device data conflict notification with Update/Dismiss/Show Changes actions and diff preview |
| `@prabhask5/stellar-engine/components/DemoBanner` | Demo mode indicator banner |

### SvelteKit Helpers (optional)

These require `svelte ^5.0.0` as a peer dependency.

| Export | Description |
|---|---|
| Layout load functions | `resolveAuthState` integration for `+layout.ts` |
| Server handlers | Factory functions for API routes (`getServerConfig`, `createValidateHandler`, `deployToVercel`) |
| Email confirmation | `handleEmailConfirmation()`, `broadcastAuthConfirmed()` |
| SW lifecycle | `monitorSwLifecycle()`, `handleSwUpdate()`, `pollForNewServiceWorker()` |
| Auth hydration | `hydrateAuthState()` for `+layout.svelte` |

### CRDT Collaborative Editing

| Export | Description |
|---|---|
| `openDocument(docId, pageId, options?)` | Open a collaborative document via Supabase Broadcast |
| `closeDocument(docId)` | Close and clean up a document |
| `createSharedText(doc)` | Create a shared Yjs text type |
| `createBlockDocument(doc)` | Create a block-based document structure |
| `updateCursor(docId, cursor)` | Update cursor position for presence |
| `getCollaborators(docId)` | Get current collaborators |
| `onCollaboratorsChange(docId, callback)` | Subscribe to collaborator changes |
| `enableOffline(docId)` / `disableOffline(docId)` | Toggle offline persistence |

### Types

All TypeScript types are available from `@prabhask5/stellar-engine/types`:

`Session`, `SyncEngineConfig`, `TableConfig`, `BatchOperation`, `SingleUserConfig`, `DemoConfig`, `SyncStatus`, `AuthState`, `CRDTConfig`, and more.

## Subpath exports

Import only what you need:

| Subpath | Contents |
|---|---|
| `@prabhask5/stellar-engine` | Core: `initEngine`, `startSyncEngine`, `runFullSync`, `supabase`, `getDb`, `resetDatabase`, `validateSupabaseCredentials`, `validateSchema`, CRUD, auth, stores, and all re-exports |
| `@prabhask5/stellar-engine/data` | CRUD + query operations + helpers |
| `@prabhask5/stellar-engine/auth` | All auth functions |
| `@prabhask5/stellar-engine/stores` | Reactive stores + store factories + event subscriptions |
| `@prabhask5/stellar-engine/types` | All type exports |
| `@prabhask5/stellar-engine/utils` | Utilities + debug + diagnostics + SQL/TS generation |
| `@prabhask5/stellar-engine/actions` | Svelte `use:` actions |
| `@prabhask5/stellar-engine/config` | Runtime config + `getDexieTableFor` |
| `@prabhask5/stellar-engine/vite` | Vite plugin |
| `@prabhask5/stellar-engine/kit` | SvelteKit helpers (optional) |
| `@prabhask5/stellar-engine/crdt` | CRDT collaborative editing |
| `@prabhask5/stellar-engine/components/SyncStatus` | Sync indicator component |
| `@prabhask5/stellar-engine/components/DeferredChangesBanner` | Conflict banner component |
| `@prabhask5/stellar-engine/components/DemoBanner` | Demo mode banner component |

## Demo mode

stellar-engine includes a built-in demo mode that provides a completely isolated sandbox. When active:

- **Separate database** -- uses `${name}_demo` IndexedDB; the real database is never opened
- **No Supabase** -- zero network requests to the backend
- **Mock auth** -- `authMode === 'demo'`; protected routes work with mock data only
- **Auto-seeded** -- your `seedData(db)` callback populates the demo database on each page load
- **Full isolation** -- page reload required to enter/exit (complete engine teardown)

```ts
import type { DemoConfig } from '@prabhask5/stellar-engine';
import { setDemoMode } from '@prabhask5/stellar-engine';

// Define demo config in initEngine
const demoConfig: DemoConfig = {
  seedData: async (db) => {
    await db.table('projects').bulkPut([
      { id: 'demo-1', name: 'Sample Project', sort_order: 1, is_deleted: false },
    ]);
  },
  mockProfile: { email: 'demo@example.com', firstName: 'Demo', lastName: 'User' },
};

initEngine({ /* ...config */, demo: demoConfig });

// Toggle demo mode from your UI
setDemoMode(true);
window.location.href = '/'; // Full reload required
```

## License

Private -- not yet published under an open-source license.
