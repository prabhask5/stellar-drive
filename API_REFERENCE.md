# Stellar Engine API Reference

Complete reference for all public exports from `@prabhask5/stellar-engine`.

### Subpath Exports

| Subpath | Contents |
|---|---|
| `@prabhask5/stellar-engine` | `initEngine`, `startSyncEngine`, `runFullSync`, `supabase`, `getDb`, `resetDatabase`, `validateSupabaseCredentials` |
| `@prabhask5/stellar-engine/data` | CRUD + query operations + query/repo helpers |
| `@prabhask5/stellar-engine/auth` | Authentication functions, display utilities (`resolveFirstName`, `resolveUserId`, `resolveAvatarInitial`) |
| `@prabhask5/stellar-engine/stores` | Reactive stores + event subscriptions + store factories |
| `@prabhask5/stellar-engine/types` | All type exports (including `Session` from Supabase) |
| `@prabhask5/stellar-engine/utils` | Utility functions + debug + diagnostics + SQL generation |
| `@prabhask5/stellar-engine/actions` | Svelte `use:` actions |
| `@prabhask5/stellar-engine/config` | Runtime config, `getDexieTableFor` |
| `@prabhask5/stellar-engine/kit` | SvelteKit route helpers, server APIs, load functions, email confirmation, auth hydration |
| `@prabhask5/stellar-engine/components/SyncStatus` | Sync status indicator Svelte component |
| `@prabhask5/stellar-engine/components/DeferredChangesBanner` | Cross-device conflict banner Svelte component |
| `@prabhask5/stellar-engine/components/DemoBanner` | Demo mode banner Svelte component |
| `@prabhask5/stellar-engine/crdt` | CRDT collaborative editing (document lifecycle, shared types, presence, offline) |

All exports are also available from the root `@prabhask5/stellar-engine` for backward compatibility.

---

## Table of Contents

- [Engine Configuration](#engine-configuration)
- [Database Access](#database-access)
- [Engine Lifecycle](#engine-lifecycle)
- [Credential Validation](#credential-validation)
- [CRUD Operations](#crud-operations)
- [Query Operations](#query-operations)
- [Query Helpers](#query-helpers)
- [Repository Helpers](#repository-helpers)
- [Store Factories](#store-factories)
- [Authentication Core](#authentication-core)
- [Auth Lifecycle](#auth-lifecycle)
- [Auth Display Utilities](#auth-display-utilities)
- [Login Guard](#login-guard)
- [Single-User Auth](#single-user-auth)
- [Device Verification](#device-verification)
- [Reactive Stores](#reactive-stores)
- [Realtime](#realtime)
- [Supabase Client](#supabase-client)
- [Runtime Configuration](#runtime-configuration)
- [Diagnostics](#diagnostics)
- [Debug](#debug)
- [Utilities](#utilities)
- [SQL & TypeScript Generation](#sql--typescript-generation)
- [Svelte Actions](#svelte-actions)
- [Svelte Components](#svelte-components)
- [SvelteKit Helpers](#sveltekit-helpers)
- [Demo Mode](#demo-mode)
- [CRDT Collaborative Editing](#crdt-collaborative-editing)
- [Types](#types)
- [CLI Commands](#cli-commands)
- [Re-exports](#re-exports)

---

## Engine Configuration

### `initEngine(config)`

Initialize the sync engine with configuration. Must be called before any other engine function. This is the first function consumers call at app startup. It accepts a `SyncEngineConfig` object that describes which Supabase tables to sync, authentication settings, sync timing parameters, and optional CRDT/demo mode configuration.

The engine supports two configuration modes:
1. **Schema-driven** (recommended) -- Provide a `schema` object. The engine auto-generates `tables`, Dexie stores, versioning, and database naming.
2. **Manual** (backward compat) -- Provide explicit `tables` and `database`.

```ts
function initEngine(config: SyncEngineConfig): void
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `SyncEngineConfig` | Engine configuration object |

**Example (schema-driven):**

```ts
import { initEngine } from '@prabhask5/stellar-engine';

initEngine({
  prefix: 'myapp',
  schema: {
    tasks: 'project_id, order',
    projects: 'is_current, order',
    user_settings: { singleton: true },
  },
  auth: {
    singleUser: { gateType: 'code', codeLength: 4 },
    enableOfflineAuth: true,
    confirmRedirectPath: '/confirm',
  },
});
```

**Example (manual):**

```ts
initEngine({
  prefix: 'myapp',
  tables: [
    {
      supabaseName: 'tasks',
      columns: 'id, user_id, name, completed, order, deleted, created_at, updated_at'
    }
  ],
  database: {
    name: 'myapp-db',
    versions: [{ version: 1, stores: { tasks: 'id, user_id, order' } }]
  }
});
```

### `SyncEngineConfig`

```ts
interface SyncEngineConfig {
  tables: TableConfig[];                       // Per-table sync config (auto-populated with schema)
  prefix: string;                              // App prefix for localStorage keys, debug, etc.
  schema?: SchemaDefinition;                   // Declarative schema (replaces tables + database)
  databaseName?: string;                       // Override auto-generated DB name (default: ${prefix}DB)
  db?: Dexie;                                  // Pre-created Dexie instance (backward compat)
  supabase?: SupabaseClient;                   // Pre-created Supabase client (backward compat)
  database?: DatabaseConfig;                   // Engine creates and owns the Dexie instance
  auth?: {
    singleUser?: {
      gateType: SingleUserGateType;            // 'code' or 'password'
      codeLength?: 4 | 6;                      // Required when gateType is 'code'
    };
    profileExtractor?: (userMetadata: Record<string, unknown>) => Record<string, unknown>;
    profileToMetadata?: (profile: Record<string, unknown>) => Record<string, unknown>;
    enableOfflineAuth?: boolean;
    sessionValidationIntervalMs?: number;
    confirmRedirectPath?: string;
    deviceVerification?: {
      enabled: boolean;
      trustDurationDays?: number;              // Default: 90
    };
    emailConfirmation?: {
      enabled: boolean;
    };
  };
  onAuthStateChange?: (event: string, session: Session | null) => void;
  onAuthKicked?: (message: string) => void;
  syncDebounceMs?: number;                     // Default: 2000
  syncIntervalMs?: number;                     // Default: 900000 (15 min)
  tombstoneMaxAgeDays?: number;                // Default: 7
  visibilitySyncMinAwayMs?: number;            // Default: 300000 (5 min)
  onlineReconnectCooldownMs?: number;          // Default: 120000 (2 min)
  demo?: DemoConfig;                           // Demo mode config (sandboxed DB, mock data)
  crdt?: CRDTConfig | true;                    // CRDT config (pass true for all defaults)
}
```

### `TableConfig`

```ts
interface TableConfig {
  supabaseName: string;                        // Supabase table name (snake_case)
  columns: string;                             // Supabase SELECT columns (egress optimization)
  ownershipFilter?: string;                    // Column used for RLS ownership filtering
  isSingleton?: boolean;                       // One record per user (e.g., user settings)
  excludeFromConflict?: string[];              // Fields to skip during conflict resolution
  numericMergeFields?: string[];               // Fields that use additive merge for conflicts
  onRemoteChange?: (table: string, record: Record<string, unknown>) => void;
}
```

The Dexie (IndexedDB) table name is **automatically derived** from `supabaseName` using `snakeToCamel()` conversion. For example, `supabaseName: 'goal_lists'` produces the Dexie table name `goalLists`. The `database.versions[].stores` config should use the camelCase names for IndexedDB index definitions.

Use `getDexieTableFor(table)` (exported from `@prabhask5/stellar-engine/config`) to resolve the Dexie table name for a given Supabase table name at runtime.

### `InitEngineInput`

Type alias representing the input to `initEngine()`. Equivalent to `SyncEngineConfig`.

### `SchemaDefinition`

```ts
type SchemaDefinition = Record<string, string | SchemaTableConfig>;
```

Each key is a Supabase table name (snake_case). Values are either a string of app-specific Dexie indexes (system indexes auto-appended) or a `SchemaTableConfig` object for full control.

```ts
const schema: SchemaDefinition = {
  goals: 'goal_list_id, order',           // string shorthand
  focus_settings: { singleton: true },     // object form
  projects: 'is_current, order',
};
```

### `SchemaTableConfig`

```ts
interface SchemaTableConfig {
  indexes?: string;                            // App-specific Dexie indexes (default: '')
  singleton?: boolean;                         // Single row per user (default: false)
  ownership?: string;                          // Override default 'user_id' ownership column
  columns?: string;                            // Explicit Supabase SELECT columns
  dexieName?: string;                          // Override auto-generated camelCase Dexie table name
  excludeFromConflict?: string[];              // Fields to skip during conflict resolution
  numericMergeFields?: string[];               // Numeric fields for additive merge during conflicts
  onRemoteChange?: (table: string, record: Record<string, unknown>) => void;
  sqlColumns?: Record<string, string>;         // Explicit SQL column types (overrides inference)
  fields?: Record<string, FieldType>;          // Declarative field defs for TS + SQL generation
  typeName?: string;                           // Override auto-generated PascalCase interface name
  renamedFrom?: string;                        // Previous table name (one-time rename hint)
  renamedColumns?: Record<string, string>;     // Column renames as { newName: oldName }
}
```

---

## Database Access

### `getDb()`

Get the engine-managed Dexie database instance. Throws if `initEngine()` has not been called.

```ts
function getDb(): Dexie
```

**Returns:** `Dexie` -- The managed IndexedDB instance.

### `resetDatabase()`

Delete the entire IndexedDB database and clear sync cursors from localStorage. Use this as a nuclear recovery option when the database is corrupted (e.g., missing object stores due to failed upgrades). After calling, the app should reload so `initEngine()` runs fresh and rehydrates from Supabase. The Supabase auth session is preserved so the user does not need to log in again.

```ts
async function resetDatabase(): Promise<string | null>
```

**Returns:** The name of the deleted database, or `null` if no managed database exists.

**Example:**

```ts
import { resetDatabase } from '@prabhask5/stellar-engine';

const dbName = await resetDatabase();
window.location.reload(); // Re-initializes everything from scratch
```

### `SYSTEM_INDEXES`

A constant string of Dexie indexes automatically appended to every app table when using the schema-driven API. Contains: `'id, user_id, created_at, updated_at, deleted, _version'`.

```ts
const SYSTEM_INDEXES: string;
```

### `computeSchemaVersion(prefix, mergedStores)`

Computes a stable version number for the Dexie database by hashing the current schema definition and comparing it against a previously stored hash in localStorage. Used internally by the schema-driven config to auto-detect schema changes and auto-increment the Dexie version.

```ts
function computeSchemaVersion(
  prefix: string,
  mergedStores: Record<string, string>
): SchemaVersionResult
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `prefix` | `string` | App prefix (used for localStorage key namespacing) |
| `mergedStores` | `Record<string, string>` | The full Dexie store schema (app tables + system tables merged) |

**Returns:** `SchemaVersionResult` with the resolved version number and any previous stores for upgrade.

### `SchemaVersionResult`

```ts
interface SchemaVersionResult {
  version: number;                             // Resolved Dexie version number (starts at 1)
  previousStores: Record<string, string> | null; // Previous version's stores, or null if no upgrade
  previousVersion: number | null;              // Previous version number, or null
}
```

### `DatabaseConfig`

```ts
interface DatabaseConfig {
  name: string;                                // IndexedDB database name (unique per app)
  versions: DatabaseVersionConfig[];           // Ordered list of version declarations
}
```

### `DatabaseVersionConfig`

```ts
interface DatabaseVersionConfig {
  version: number;                             // Version number (positive integer, monotonically increasing)
  stores: Record<string, string>;              // App tables only; system tables are auto-merged
  upgrade?: (tx: Transaction) => Promise<void>; // Optional data migration function
}
```

---

## Engine Lifecycle

### `startSyncEngine()`

Start the sync engine. Sets up event listeners for online/offline, visibility changes, periodic sync, realtime subscriptions, and initial data hydration. Safe to call multiple times (cleans up previous listeners). On first call (when online), runs one-time schema validation via `validateSchema()`.

```ts
async function startSyncEngine(): Promise<void>
```

**Example:**

```ts
import { startSyncEngine } from '@prabhask5/stellar-engine';

await startSyncEngine();
```

### `runFullSync(quiet?, skipPull?)`

Execute a full push-then-pull sync cycle. Pushes pending local changes to Supabase, then pulls remote changes into IndexedDB.

```ts
async function runFullSync(quiet?: boolean, skipPull?: boolean): Promise<void>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `quiet` | `boolean` | `false` | If true, do not update UI sync status indicators |
| `skipPull` | `boolean` | `false` | If true, only push (skip pull from server) |

### `onSyncComplete(callback)`

Register a callback that fires after each successful sync cycle. Returns an unsubscribe function.

```ts
function onSyncComplete(callback: () => void): () => void
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `callback` | `() => void` | Function to call when sync completes |

**Returns:** `() => void` -- Unsubscribe function.

**Example:**

```ts
import { onSyncComplete } from '@prabhask5/stellar-engine';

const unsubscribe = onSyncComplete(() => {
  console.log('Sync complete, refresh UI');
});
// Later: unsubscribe();
```

---

## Credential Validation

### `validateSupabaseCredentials(url, anonKey)`

> **Subpath:** `@prabhask5/stellar-engine` (root)

Test connectivity to a Supabase project using provided credentials. Creates a temporary client, runs a test query, and checks for common error patterns (invalid API key, missing schema, etc.). Useful in setup/onboarding flows.

```ts
async function validateSupabaseCredentials(
  url: string,
  anonKey: string
): Promise<{ valid: boolean; error?: string }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | Supabase project URL |
| `anonKey` | `string` | Supabase anonymous key |

**Returns:** `{ valid: true }` if credentials work, or `{ valid: false, error: string }`.

### `validateSchema()`

> **Subpath:** `@prabhask5/stellar-engine` (root)

Validates that all configured Supabase tables exist and are accessible. Runs `SELECT id FROM <table> LIMIT 0` per table (zero data egress). If `auth.deviceVerification?.enabled`, also validates the `trusted_devices` table. Called automatically by `startSyncEngine()` on first run when online -- can also be called manually.

```ts
async function validateSchema(): Promise<{
  valid: boolean;
  missingTables: string[];
  errors: string[];
}>
```

**Returns:** `{ valid: true, missingTables: [], errors: [] }` if all tables are accessible. Otherwise, `valid` is `false` and `missingTables` lists tables that do not exist, while `errors` includes human-readable messages for all issues (missing tables, RLS denials, etc.).

**Behavior:** Does not throw. Logs errors via the debug system. When called from `startSyncEngine()`, sets `syncStatusStore` to `'error'` with a descriptive message if validation fails.

---

## CRUD Operations

All CRUD functions use Supabase table names as the API surface and internally resolve to Dexie table names. Writes go to IndexedDB first, then sync to Supabase in the background.

### `engineCreate(table, data)`

Create a new entity. Writes to local DB, queues sync, and schedules push.

```ts
async function engineCreate(
  table: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `data` | `Record<string, unknown>` | Entity data. If `id` is omitted, a UUID is generated. |

**Returns:** The created entity (with `id`).

**Example:**

```ts
const task = await engineCreate('tasks', {
  user_id: userId,
  name: 'New Task',
  completed: false,
  order: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});
```

### `engineUpdate(table, id, fields)`

Update an entity's fields. Automatically sets `updated_at`.

```ts
async function engineUpdate(
  table: string,
  id: string,
  fields: Record<string, unknown>
): Promise<Record<string, unknown> | undefined>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `id` | `string` | Entity ID |
| `fields` | `Record<string, unknown>` | Fields to update |

**Returns:** The updated entity, or `undefined` if not found.

### `engineDelete(table, id)`

Soft-delete an entity. Sets `deleted: true` and queues a delete sync operation.

```ts
async function engineDelete(table: string, id: string): Promise<void>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `id` | `string` | Entity ID |

### `engineBatchWrite(operations)`

Execute multiple write operations in a single atomic IndexedDB transaction.

```ts
async function engineBatchWrite(operations: BatchOperation[]): Promise<void>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `operations` | `BatchOperation[]` | Array of create/update/delete operations |

### `BatchOperation`

```ts
type BatchOperation =
  | { type: 'create'; table: string; data: Record<string, unknown> }
  | { type: 'update'; table: string; id: string; fields: Record<string, unknown> }
  | { type: 'delete'; table: string; id: string };
```

**Example:**

```ts
await engineBatchWrite([
  { type: 'create', table: 'tasks', data: { user_id: uid, name: 'A' } },
  { type: 'update', table: 'tasks', id: 'abc', fields: { name: 'B' } },
  { type: 'delete', table: 'tasks', id: 'xyz' }
]);
```

### `engineIncrement(table, id, field, amount, additionalFields?)`

Increment a numeric field. Preserves increment intent for conflict resolution so multi-device increments can be additive.

```ts
async function engineIncrement(
  table: string,
  id: string,
  field: string,
  amount: number,
  additionalFields?: Record<string, unknown>
): Promise<Record<string, unknown> | undefined>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `id` | `string` | Entity ID |
| `field` | `string` | Numeric field to increment |
| `amount` | `number` | Delta to add (can be negative) |
| `additionalFields` | `Record<string, unknown>` | Optional extra fields to set alongside the increment |

**Returns:** The updated entity, or `undefined` if not found.

---

## Query Operations

All queries read from local IndexedDB first. Optional `remoteFallback` fetches from Supabase if local results are empty.

### `engineGet(table, id, opts?)`

Get a single entity by ID.

```ts
async function engineGet(
  table: string,
  id: string,
  opts?: { remoteFallback?: boolean }
): Promise<Record<string, unknown> | null>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `id` | `string` | Entity ID |
| `opts.remoteFallback` | `boolean` | If true, fetch from Supabase when not found locally |

### `engineGetAll(table, opts?)`

Get all entities from a table.

```ts
async function engineGetAll(
  table: string,
  opts?: { orderBy?: string; remoteFallback?: boolean }
): Promise<Record<string, unknown>[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `opts.orderBy` | `string` | Dexie index to order by |
| `opts.remoteFallback` | `boolean` | If true, fetch from Supabase when local is empty |

### `engineQuery(table, index, value, opts?)`

Query entities by index equality (`WHERE index = value`).

```ts
async function engineQuery(
  table: string,
  index: string,
  value: unknown,
  opts?: { remoteFallback?: boolean }
): Promise<Record<string, unknown>[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `index` | `string` | Dexie index name |
| `value` | `unknown` | Value to match |
| `opts.remoteFallback` | `boolean` | If true, fetch from Supabase when local is empty |

### `engineQueryRange(table, index, lower, upper, opts?)`

Range query (`WHERE index BETWEEN lower AND upper`, inclusive).

```ts
async function engineQueryRange(
  table: string,
  index: string,
  lower: unknown,
  upper: unknown,
  opts?: { remoteFallback?: boolean }
): Promise<Record<string, unknown>[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `index` | `string` | Dexie index name |
| `lower` | `unknown` | Lower bound (inclusive) |
| `upper` | `unknown` | Upper bound (inclusive) |
| `opts.remoteFallback` | `boolean` | If true, fetch from Supabase when local is empty |

### `engineGetOrCreate(table, index, value, defaults, opts?)`

Get a singleton entity by index, or create it with defaults if it does not exist. Useful for per-user settings records.

```ts
async function engineGetOrCreate(
  table: string,
  index: string,
  value: unknown,
  defaults: Record<string, unknown>,
  opts?: { checkRemote?: boolean }
): Promise<Record<string, unknown>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `index` | `string` | Dexie index to search |
| `value` | `unknown` | Value to match |
| `defaults` | `Record<string, unknown>` | Default fields for new entity (excluding `id`, `created_at`, `updated_at`) |
| `opts.checkRemote` | `boolean` | If true, check Supabase before creating locally |

**Returns:** The existing or newly created entity.

---

## Query Helpers

Convenience wrappers that apply the most common post-processing to engine queries: filtering out soft-deleted records and sorting by `order`.

### `queryAll<T>(table, opts?)`

Fetch all non-deleted records from a table, sorted by `order`.

```ts
async function queryAll<T extends Record<string, unknown>>(
  table: string,
  opts?: { remoteFallback?: boolean; orderBy?: string }
): Promise<T[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `opts.remoteFallback` | `boolean` | If true, fetch from Supabase when local is empty |
| `opts.orderBy` | `string` | Dexie index to pre-sort by before filtering |

**Returns:** Non-deleted entity records sorted by `order` ascending.

**Example:**

```ts
import { queryAll } from '@prabhask5/stellar-engine/data';

const categories = await queryAll<TaskCategory>('task_categories');
```

### `queryOne<T>(table, id, opts?)`

Fetch a single non-deleted record by ID, or `null`.

```ts
async function queryOne<T extends Record<string, unknown>>(
  table: string,
  id: string,
  opts?: { remoteFallback?: boolean }
): Promise<T | null>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `id` | `string` | Entity ID |
| `opts.remoteFallback` | `boolean` | If true, fetch from Supabase when not found locally |

**Returns:** The entity record, or `null` if not found or soft-deleted.

**Example:**

```ts
import { queryOne } from '@prabhask5/stellar-engine/data';

const task = await queryOne<Task>('tasks', taskId);
if (!task) console.log('Not found or deleted');
```

---

## Repository Helpers

Generic functions for common repository operations across any entity table.

### `reorderEntity<T>(table, id, newOrder)`

Update just the `order` field on any entity.

```ts
async function reorderEntity<T extends Record<string, unknown>>(
  table: string,
  id: string,
  newOrder: number
): Promise<T | undefined>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `id` | `string` | Entity ID |
| `newOrder` | `number` | The new order value |

**Returns:** The updated entity, or `undefined` if not found.

### `prependOrder(table, indexField, indexValue)`

Compute the next prepend-order value for inserting at the top of a list. Returns `min(existing orders) - 1`, or `0` if no records exist.

```ts
async function prependOrder(
  table: string,
  indexField: string,
  indexValue: string
): Promise<number>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | Supabase table name |
| `indexField` | `string` | Indexed field to filter on (e.g., `'user_id'`) |
| `indexValue` | `string` | Value to match against the index |

**Returns:** The computed order value for prepending.

**Example:**

```ts
import { prependOrder, engineCreate } from '@prabhask5/stellar-engine/data';

const order = await prependOrder('tasks', 'user_id', currentUserId);
await engineCreate('tasks', { user_id: currentUserId, name: 'New Task', order });
```

---

## Store Factories

Generic factory functions that create Svelte-compatible reactive stores with built-in loading state management and sync-complete auto-refresh. These eliminate the ~50 lines of boilerplate that every collection or detail store typically requires.

> **Subpath:** `@prabhask5/stellar-engine/stores`

### `createCollectionStore<T>(config)`

Create a reactive store managing a collection of entities.

```ts
function createCollectionStore<T>(config: CollectionStoreConfig<T>): CollectionStore<T>
```

**`CollectionStoreConfig<T>`:**

| Property | Type | Description |
|----------|------|-------------|
| `load` | `() => Promise<T[]>` | Async function that fetches the full collection |

**`CollectionStore<T>` methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe` | `(run) => unsubscribe` | Standard Svelte store contract |
| `loading` | `{ subscribe }` | Read-only boolean loading sub-store |
| `load` | `() => Promise<void>` | Fetch data, set loading state, register sync listener |
| `refresh` | `() => Promise<void>` | Re-fetch without toggling loading flag |
| `set` | `(data: T[]) => void` | Replace data directly |
| `mutate` | `(fn: (items: T[]) => T[]) => void` | Optimistic update |

**Example:**

```ts
import { createCollectionStore } from '@prabhask5/stellar-engine/stores';
import { queryAll } from '@prabhask5/stellar-engine/data';

function createTaskCategoriesStore() {
  const store = createCollectionStore<TaskCategory>({
    load: () => queryAll<TaskCategory>('task_categories'),
  });

  return {
    ...store,
    create: async (name: string, userId: string) => {
      await engineCreate('task_categories', { name, user_id: userId });
      await store.refresh();
    },
  };
}
```

### `createDetailStore<T>(config)`

Create a reactive store managing a single entity.

```ts
function createDetailStore<T>(config: DetailStoreConfig<T>): DetailStore<T>
```

**`DetailStoreConfig<T>`:**

| Property | Type | Description |
|----------|------|-------------|
| `load` | `(id: string) => Promise<T \| null>` | Async function that fetches a single entity by ID |

**`DetailStore<T>` methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe` | `(run) => unsubscribe` | Standard Svelte store contract |
| `loading` | `{ subscribe }` | Read-only boolean loading sub-store |
| `load` | `(id: string) => Promise<void>` | Fetch entity by ID, register sync listener |
| `clear` | `() => void` | Reset to null, clear tracked ID |
| `set` | `(data: T \| null) => void` | Replace data directly |
| `getCurrentId` | `() => string \| null` | Get the currently tracked entity ID |

**Example:**

```ts
import { createDetailStore } from '@prabhask5/stellar-engine/stores';
import { queryOne } from '@prabhask5/stellar-engine/data';

const taskDetail = createDetailStore<Task>({
  load: (id) => queryOne<Task>('tasks', id),
});

// In your component:
await taskDetail.load(taskId);
// $taskDetail is Task | null
```

---

## Authentication Core

### `signOut(options?)`

Sign out. Stops sync engine, clears local data, clears offline sessions, and signs out of Supabase.

```ts
async function signOut(options?: {
  preserveOfflineCredentials?: boolean;
  preserveLocalData?: boolean;
}): Promise<{ error: string | null }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `options.preserveOfflineCredentials` | `boolean` | If true, keep cached offline credentials |
| `options.preserveLocalData` | `boolean` | If true, keep local IndexedDB data and sync queue |

### `resendConfirmationEmail(email)`

Resend the signup confirmation email.

```ts
async function resendConfirmationEmail(email: string): Promise<{ error: string | null }>
```

### `getUserProfile(user)`

Extract the user profile from a Supabase `User` object. Uses `profileExtractor` from config if provided, otherwise returns `user_metadata` directly.

```ts
function getUserProfile(user: User | null): Record<string, unknown>
```

### `updateProfile(profile)`

Update the current user's profile metadata. Also updates the offline credential cache.

```ts
async function updateProfile(
  profile: Record<string, unknown>
): Promise<{ error: string | null }>
```

### `verifyOtp(tokenHash, type)`

Verify an OTP token for email confirmation or email change.

```ts
async function verifyOtp(
  tokenHash: string,
  type: 'signup' | 'email' | 'email_change'
): Promise<{ error: string | null }>
```

### `getValidSession()`

Get the current Supabase session if it exists and is not expired.

```ts
async function getValidSession(): Promise<Session | null>
```

---

## Auth Lifecycle

### `resolveAuthState()`

Determine the current authentication state. Checks Supabase session when online, falls back to offline session when offline. For single-user mode, also checks whether initial setup is complete.

```ts
async function resolveAuthState(): Promise<AuthStateResult>
```

**Returns:** `AuthStateResult`

**Example:**

```ts
import { resolveAuthState } from '@prabhask5/stellar-engine';

const { session, authMode, offlineProfile } = await resolveAuthState();
if (authMode === 'supabase') {
  // Online with valid Supabase session
} else if (authMode === 'offline') {
  // Offline with valid cached credentials
} else {
  // No valid session -- redirect to login
}
```

### `AuthStateResult`

```ts
interface AuthStateResult {
  session: Session | null;
  authMode: 'supabase' | 'offline' | 'demo' | 'none';
  offlineProfile: OfflineCredentials | null;
  singleUserSetUp?: boolean;                   // Only present in single-user mode
}
```

When `auth.singleUser` is configured, the `singleUserSetUp` field indicates whether the user has completed initial setup. If `false`, the app should show a setup screen. If `true` and `authMode` is `'none'`, the user is locked and should see an unlock screen.

---

## Auth Display Utilities

Pure helper functions that resolve user-facing display values from the auth state. Each handles the full fallback chain across online (Supabase session) and offline (cached credentials) modes. These are stateless and framework-agnostic -- wrap in `$derived` for Svelte 5 reactivity.

### `resolveFirstName(session, offlineProfile, fallback?)`

Resolve the user's first name for greeting / display purposes.

```ts
function resolveFirstName(
  session: Session | null,
  offlineProfile: OfflineCredentials | null,
  fallback?: string
): string
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `session` | `Session \| null` | -- | Current Supabase session |
| `offlineProfile` | `OfflineCredentials \| null` | -- | Cached offline credentials |
| `fallback` | `string` | `'Explorer'` | Value returned when no name can be resolved |

**Fallback chain:**
1. `firstName` / `first_name` from Supabase session profile (via `getUserProfile()`)
2. Email username (before `@`) from Supabase session
3. `firstName` from offline cached profile
4. Email username from offline cached profile
5. `fallback` string

**Example:**

```svelte
<script lang="ts">
  import { resolveFirstName } from '@prabhask5/stellar-engine/auth';
  import { authState } from '@prabhask5/stellar-engine/stores';

  const firstName = $derived(
    resolveFirstName($authState.session, $authState.offlineProfile)
  );
</script>

<h1>Hey, {firstName}!</h1>
```

### `resolveUserId(session, offlineProfile)`

Resolve the current user's UUID from auth state. Checks the Supabase session first, then falls back to the offline credential cache.

```ts
function resolveUserId(
  session: Session | null,
  offlineProfile: OfflineCredentials | null
): string
```

**Returns:** The user's UUID, or `''` if unauthenticated.

### `resolveAvatarInitial(session, offlineProfile, fallback?)`

Resolve a single uppercase initial letter for avatar display. Uses `resolveFirstName()` internally, then returns the first character uppercased.

```ts
function resolveAvatarInitial(
  session: Session | null,
  offlineProfile: OfflineCredentials | null,
  fallback?: string
): string
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `session` | `Session \| null` | -- | Current Supabase session |
| `offlineProfile` | `OfflineCredentials \| null` | -- | Cached offline credentials |
| `fallback` | `string` | `'?'` | Character returned when no initial can be derived |

**Returns:** A single uppercase character.

---

## Login Guard

The login guard provides local credential pre-checking and rate limiting to minimize unnecessary Supabase auth requests. It is used internally by `unlockSingleUser()` and `linkSingleUserDevice()`.

**How it works:**

- When a cached `gateHash` exists, passwords are verified locally first. Wrong passwords are rejected without making a Supabase call.
- When no cached credentials exist (new device, first login), exponential backoff rate limiting is applied (1s base, 30s max, 2x multiplier). The `retryAfterMs` field in the response indicates how long to wait.
- If a user changes their password on another device, the local hash will no longer match. After 5 consecutive local rejections, the cached hash is invalidated and the system falls through to rate-limited Supabase authentication. On successful Supabase login, the new hash is cached immediately.
- If a locally-matched password is rejected by Supabase (stale hash), the cached hash is invalidated so future attempts use Supabase directly.

**State is in-memory only** -- it resets on page refresh.

### `resetLoginGuard()`

Reset all login guard state (counters and rate limiting). Called automatically by `signOut()`. Consumers should call this if implementing custom sign-out flows.

```ts
function resetLoginGuard(): void
```

---

## Single-User Auth

Single-user mode uses **real Supabase email/password auth** where the user provides an email during setup and a PIN code (or password) that is padded and used as the Supabase password. The PIN is verified server-side by Supabase -- no client-side hash comparison. This gives server-side rate limiting, real user identity, and proper RLS enforcement.

This mode is designed for personal apps where there is one user per device/deployment.

**Requirements:**
- If `deviceVerification.enabled`, create a `trusted_devices` table in Supabase (see README for full SQL).
- If `emailConfirmation.enabled`, configure Supabase email templates in your Supabase project under Authentication > Email Templates.

**Configuration:**

```ts
initEngine({
  // ...
  auth: {
    singleUser: { gateType: 'code', codeLength: 4 },
    emailConfirmation: { enabled: true },
    deviceVerification: { enabled: true, trustDurationDays: 90 },
    enableOfflineAuth: true,
    confirmRedirectPath: '/confirm',
    profileExtractor: (meta) => ({ firstName: meta.first_name, lastName: meta.last_name }),
    profileToMetadata: (p) => ({ first_name: p.firstName, last_name: p.lastName }),
  },
});
```

### `isSingleUserSetUp()`

Check if single-user mode has been set up (i.e., a `SingleUserConfig` record exists in IndexedDB).

```ts
async function isSingleUserSetUp(): Promise<boolean>
```

### `getSingleUserInfo()`

Get non-sensitive display info about the configured single user. Returns `null` if not set up.

```ts
async function getSingleUserInfo(): Promise<{
  profile: Record<string, unknown>;
  gateType: SingleUserGateType;
  codeLength?: 4 | 6;
} | null>
```

**Example:**

```ts
import { getSingleUserInfo } from '@prabhask5/stellar-engine/auth';

const info = await getSingleUserInfo();
if (info) {
  console.log(`Welcome back, ${info.profile.firstName}`);
  // info.gateType === 'code', info.codeLength === 4
}
```

### `setupSingleUser(gate, profile, email)`

First-time setup. Calls `supabase.auth.signUp()` with the email and padded PIN as password. Stores config in IndexedDB. If `emailConfirmation.enabled`, returns `{ confirmationRequired: true }` -- the app should show a confirmation modal.

```ts
async function setupSingleUser(
  gate: string,
  profile: Record<string, unknown>,
  email: string
): Promise<{ error: string | null; confirmationRequired: boolean }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `gate` | `string` | The PIN code or password |
| `profile` | `Record<string, unknown>` | User profile (e.g., `{ firstName, lastName }`) |
| `email` | `string` | Email address for Supabase email/password auth |

**Example:**

```ts
import { setupSingleUser } from '@prabhask5/stellar-engine/auth';

const { error, confirmationRequired } = await setupSingleUser('1234', {
  firstName: 'Alice',
  lastName: 'Smith',
}, 'alice@example.com');
if (error) console.error(error);
if (confirmationRequired) {
  // Show email confirmation modal
}
```

### `unlockSingleUser(gate)`

Verify PIN via local `gateHash` pre-check, then `supabase.auth.signInWithPassword()`. Wrong PINs are rejected locally without hitting Supabase when a `gateHash` is cached. If `deviceVerification.enabled` and the current device is not trusted, signs out and sends OTP, returning `{ deviceVerificationRequired: true, maskedEmail }`. Falls back to offline hash verification when offline.

```ts
async function unlockSingleUser(
  gate: string
): Promise<{
  error: string | null;
  deviceVerificationRequired?: boolean;
  maskedEmail?: string;
  retryAfterMs?: number;
}>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `gate` | `string` | The PIN code or password to verify |

**Returns:** `{ error: null }` on success, or `{ error: string }` if the gate is incorrect or setup is incomplete. Includes `retryAfterMs` when rate-limited. If device verification is required, returns `{ deviceVerificationRequired: true, maskedEmail }` instead of completing sign-in.

### `lockSingleUser()`

Lock the app. Stops the sync engine and resets auth state to `'none'`. Does **not** sign out of Supabase, destroy the session, or clear local data -- so unlocking is fast.

```ts
async function lockSingleUser(): Promise<void>
```

### `changeSingleUserGate(oldGate, newGate)`

Change the gate (code or password). Verifies the old gate locally against the cached `gateHash` when available, falling back to `signInWithPassword()` if no hash is cached. Uses `supabase.auth.updateUser()` to change the password.

```ts
async function changeSingleUserGate(
  oldGate: string,
  newGate: string
): Promise<{ error: string | null }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `oldGate` | `string` | Current code or password |
| `newGate` | `string` | New code or password |

### `updateSingleUserProfile(profile)`

Update the user's profile in IndexedDB and Supabase `user_metadata`.

```ts
async function updateSingleUserProfile(
  profile: Record<string, unknown>
): Promise<{ error: string | null }>
```

### `changeSingleUserEmail(newEmail)`

Initiate an email change in single-user mode. Requires an internet connection. Calls `supabase.auth.updateUser({ email })` which sends a confirmation email to the new address. Use `completeSingleUserEmailChange()` after confirmation.

```ts
async function changeSingleUserEmail(
  newEmail: string
): Promise<{ error: string | null; confirmationRequired: boolean }>
```

**Returns:** `{ error: null, confirmationRequired: true }` on success. Returns an error if offline or not set up.

### `completeSingleUserEmailChange()`

Complete an email change after the user confirms via the email link. Refreshes the session, updates the local IndexedDB config's `email` field, and updates the offline credentials cache.

```ts
async function completeSingleUserEmailChange(): Promise<{ error: string | null; newEmail: string | null }>
```

### `completeSingleUserSetup()`

Called after email confirmation succeeds (e.g., when the confirm page broadcasts `AUTH_CONFIRMED`).

```ts
async function completeSingleUserSetup(): Promise<{ error: string | null }>
```

### `completeDeviceVerification(tokenHash?)`

Called after device OTP verification succeeds. Trusts the current device and restores auth state.

```ts
async function completeDeviceVerification(
  tokenHash?: string
): Promise<{ error: string | null }>
```

### `pollDeviceVerification()`

Polls for device verification completion. Used when waiting for the user to click the email OTP link in another tab.

```ts
async function pollDeviceVerification(): Promise<{ verified: boolean; error: string | null }>
```

### `linkSingleUserDevice(email, pin)`

Link a new device to an existing single-user account. Signs in with email + padded PIN, builds local config from `user_metadata`. Rate limiting with exponential backoff is applied since no local hash exists on a new device.

```ts
async function linkSingleUserDevice(
  email: string,
  pin: string
): Promise<{
  error: string | null;
  deviceVerificationRequired?: boolean;
  maskedEmail?: string;
  retryAfterMs?: number;
}>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `email` | `string` | The account email |
| `pin` | `string` | The PIN code or password |

### `resetSingleUser()`

Full reset: clears the single-user config from IndexedDB, signs out of Supabase, and clears all local data. After reset, the app should show the setup screen again.

```ts
async function resetSingleUser(): Promise<{ error: string | null }>
```

### `resetSingleUserRemote()`

Remote account reset: deletes the Supabase user account and all remote data, then performs a local reset. Use when the user wants to completely destroy their account.

```ts
async function resetSingleUserRemote(): Promise<{ error: string | null }>
```

### `fetchRemoteGateConfig()`

Fetch the gate configuration from a remote Supabase user's metadata. Used during device linking to determine the gate type and code length before prompting the user.

```ts
async function fetchRemoteGateConfig(): Promise<{
  gateType: SingleUserGateType;
  codeLength?: 4 | 6;
} | null>
```

### `padPin(pin)`

Pad a PIN to meet Supabase's minimum password length. Must match across all clients (app + extension).

```ts
function padPin(pin: string): string
```

---

## Device Verification

Optional device trust system that requires email OTP verification on untrusted devices. Enable via `auth.deviceVerification.enabled`.

### `isDeviceTrusted(userId)`

Check if the current device is trusted for a given user.

```ts
async function isDeviceTrusted(userId: string): Promise<boolean>
```

### `trustCurrentDevice(userId)`

Mark the current device as trusted for a given user. Writes to the `trusted_devices` Supabase table.

```ts
async function trustCurrentDevice(userId: string): Promise<void>
```

### `trustPendingDevice()`

Trust a device that has just completed OTP verification. Used internally by the confirm flow.

```ts
async function trustPendingDevice(): Promise<void>
```

### `getTrustedDevices(userId)`

List all trusted devices for a user from the `trusted_devices` Supabase table.

```ts
async function getTrustedDevices(userId: string): Promise<TrustedDevice[]>
```

### `removeTrustedDevice(id)`

Remove a trusted device by its record ID.

```ts
async function removeTrustedDevice(id: string): Promise<void>
```

### `sendDeviceVerification(email)`

Sign out and send OTP to the email for device verification.

```ts
async function sendDeviceVerification(email: string): Promise<{ error: string | null }>
```

### `verifyDeviceCode(tokenHash)`

Verify an OTP token for device verification.

```ts
async function verifyDeviceCode(tokenHash: string): Promise<{ error: string | null }>
```

### `maskEmail(email)`

Mask an email for display (e.g., `"pr****@gmail.com"`).

```ts
function maskEmail(email: string): string
```

### `getDeviceLabel()`

Get a human-readable label for the current device (e.g., `"Chrome on macOS"`).

```ts
function getDeviceLabel(): string
```

### `getCurrentDeviceId()`

Get the current device's stable ID. Generated once and persisted in localStorage.

```ts
function getCurrentDeviceId(): string
```

### `TrustedDevice`

```ts
interface TrustedDevice {
  id: string;
  userId: string;
  deviceId: string;
  deviceLabel: string | null;
  trustedAt: string;
  lastUsedAt: string;
}
```

---

## Reactive Stores

All stores are Svelte-compatible (implement `subscribe`). Use `$store` syntax in `.svelte` files.

### `syncStatusStore`

Svelte store tracking sync engine status.

**Type:** Svelte writable store of `SyncState`

```ts
interface SyncState {
  status: SyncStatus;           // 'idle' | 'syncing' | 'error' | 'offline'
  pendingCount: number;
  lastError: string | null;
  lastErrorDetails: string | null;
  syncErrors: SyncError[];
  lastSyncTime: string | null;
  syncMessage: string | null;
  isTabVisible: boolean;
  realtimeState: RealtimeState;
}
```

**Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe` | `(cb) => unsubscribe` | Standard Svelte subscribe |
| `setStatus` | `(status: SyncStatus) => void` | Update sync status with min-display-time debounce |
| `setPendingCount` | `(count: number) => void` | Set pending operation count |
| `setError` | `(friendly: string \| null, raw?: string \| null) => void` | Set error messages |
| `addSyncError` | `(error: SyncError) => void` | Add a detailed sync error (max 10 kept) |
| `clearSyncErrors` | `() => void` | Clear all sync errors |
| `setLastSyncTime` | `(time: string) => void` | Set last successful sync timestamp |
| `setSyncMessage` | `(message: string \| null) => void` | Set human-readable status message |
| `setTabVisible` | `(visible: boolean) => void` | Track tab visibility |
| `setRealtimeState` | `(state: RealtimeState) => void` | Track realtime connection state |
| `reset` | `() => void` | Reset to initial idle state |

### `SyncError`

```ts
interface SyncError {
  table: string;
  operation: string;
  entityId: string;
  message: string;
  timestamp: string;
}
```

### `RealtimeState`

```ts
type RealtimeState = 'disconnected' | 'connecting' | 'connected' | 'error';
```

### `remoteChangesStore`

Svelte store managing incoming realtime changes, active editing state, and deferred changes for UI animations.

**Key methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe` | `(cb) => unsubscribe` | Standard Svelte subscribe |
| `recordRemoteChange` | `(entityId, entityType, fields, applied, eventType?, valueDelta?) => { deferred, actionType }` | Record an incoming remote change |
| `recordLocalChange` | `(entityId, entityType, actionType, fields?) => void` | Record a local change for animation |
| `startEditing` | `(entityId, entityType, formType, fields?) => void` | Mark entity as being edited |
| `stopEditing` | `(entityId, entityType) => RemoteChange[]` | Stop editing; returns deferred changes |
| `isEditing` | `(entityId, entityType) => boolean` | Check if entity is being edited |
| `wasRecentlyChanged` | `(entityId, entityType) => boolean` | Check if entity was recently changed |
| `getRecentChange` | `(entityId, entityType) => RemoteChange \| null` | Get recent change details |
| `markPendingDelete` | `(entityId, entityType) => Promise<void>` | Mark entity for delete animation |
| `isPendingDelete` | `(entityId, entityType) => boolean` | Check pending deletion status |
| `clear` | `() => void` | Clear all tracking |
| `destroy` | `() => void` | Stop cleanup interval |

### `RemoteActionType`

```ts
type RemoteActionType =
  | 'create' | 'delete' | 'toggle' | 'increment'
  | 'decrement' | 'reorder' | 'rename' | 'update';
```

### `isOnline`

Svelte readable store tracking network connectivity. Also provides lifecycle hooks.

**Type:** `Readable<boolean>` with additional methods.

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe` | `(cb) => unsubscribe` | Standard Svelte subscribe; value is `true` when online |
| `init` | `() => void` | Initialize network listeners (idempotent) |
| `onReconnect` | `(callback) => unsubscribe` | Register callback for when connection is restored |
| `onDisconnect` | `(callback) => unsubscribe` | Register callback for when connection is lost |

### `authState`

Svelte store tracking authentication mode and session. The store value is an **object** with properties `mode`, `session`, `offlineProfile`, `isLoading`, and `authKickedMessage`.

**Key methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `subscribe` | `(cb) => unsubscribe` | Standard Svelte subscribe |
| `setSupabaseAuth` | `(session: Session) => void` | Set mode to `'supabase'` with session |
| `setOfflineAuth` | `(profile: OfflineCredentials) => void` | Set mode to `'offline'` with cached profile |
| `setDemoAuth` | `() => void` | Set mode to `'demo'` |
| `setNoAuth` | `(kickedMessage?: string) => void` | Set mode to `'none'` |
| `setLoading` | `(isLoading: boolean) => void` | Set loading state |
| `clearKickedMessage` | `() => void` | Clear the auth-kicked message |
| `updateSession` | `(session: Session \| null) => void` | Update session (e.g., on token refresh) |
| `updateUserProfile` | `(profile: Record<string, unknown>) => void` | Update profile info in current session |
| `reset` | `() => void` | Reset to initial state |

**Important:** `authState` is an object store. Do NOT compare `$authState === 'string'` -- use `$authState.mode` or check `data.authMode` from layout load data.

### `isAuthenticated`

Svelte derived readable store. `true` when auth mode is not `'none'` and loading is complete.

```ts
const isAuthenticated: Readable<boolean>
```

### `userDisplayInfo`

Svelte derived readable store providing user profile and email for display.

```ts
const userDisplayInfo: Readable<{
  profile: Record<string, unknown>;
  email: string;
} | null>
```

---

## Realtime

### `onRealtimeDataUpdate(callback)`

Subscribe to realtime data update notifications. The callback fires after a remote change is applied to the local database.

```ts
function onRealtimeDataUpdate(
  callback: (table: string, entityId: string) => void
): () => void
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `callback` | `(table: string, entityId: string) => void` | Called with table name and entity ID on each remote update |

**Returns:** `() => void` -- Unsubscribe function.

---

## Supabase Client

### `supabase`

Proxy-based lazy singleton for the Supabase client. Created on first access using runtime config. Use for advanced or custom queries not covered by the engine's CRUD functions.

```ts
const supabase: SupabaseClient
```

**Example:**

```ts
import { supabase } from '@prabhask5/stellar-engine';

const { data, error } = await supabase
  .from('custom_table')
  .select('*')
  .eq('status', 'active');
```

---

## Runtime Configuration

### `initConfig()`

Initialize runtime configuration. Loads from localStorage cache first (instant), then validates against the server (`/api/config`). Supports offline PWA use via cache fallback.

```ts
async function initConfig(): Promise<AppConfig | null>
```

**Returns:** `AppConfig | null` -- The config if the app is configured, `null` otherwise.

### `getConfig()`

Get the current config synchronously. Returns the cached config or attempts to load from localStorage.

```ts
function getConfig(): AppConfig | null
```

### `setConfig(config)`

Set config directly and persist to localStorage cache. Used after a setup wizard completes.

```ts
function setConfig(config: AppConfig): void
```

### `AppConfig`

```ts
interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  configured: boolean;
}
```

### `getDexieTableFor(table)`

Resolve the Dexie (IndexedDB) table name for a given Supabase table name. Returns the camelCase name derived via `snakeToCamel()`.

```ts
function getDexieTableFor(table: string): string
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | `string` | The Supabase table name (e.g., `'goal_lists'`) |

**Returns:** `string` -- The corresponding Dexie table name (e.g., `'goalLists'`).

**Example:**

```ts
import { getDexieTableFor } from '@prabhask5/stellar-engine/config';

getDexieTableFor('goal_lists'); // 'goalLists'
getDexieTableFor('projects');   // 'projects'
```

---

## Diagnostics

**Import:** `import { getDiagnostics, ... } from '@prabhask5/stellar-engine'`
**Subpath:** `import { getDiagnostics, ... } from '@prabhask5/stellar-engine/utils'`

The diagnostics module provides a unified API for inspecting the internal state of the sync engine. Each call returns a **point-in-time snapshot** -- poll at your desired frequency for a live dashboard.

### `getDiagnostics()`

Capture a comprehensive diagnostics snapshot covering all engine subsystems.

```ts
async function getDiagnostics(): Promise<DiagnosticsSnapshot>
```

**Returns:** A `DiagnosticsSnapshot` containing: `timestamp`, `prefix`, `deviceId`, `sync`, `egress`, `queue`, `realtime`, `network`, `engine`, `conflicts`, `errors`, `config`.

**Example:**

```ts
const snapshot = await getDiagnostics();
console.log(JSON.stringify(snapshot, null, 2));
```

### `getSyncDiagnostics()`

Get sync cycle and egress statistics (synchronous).

```ts
function getSyncDiagnostics(): { sync: {...}; egress: {...} }
```

### `getRealtimeDiagnostics()`

Get WebSocket connection state (synchronous).

```ts
function getRealtimeDiagnostics(): { connectionState; healthy; reconnectAttempts; ... }
```

### `getQueueDiagnostics()`

Get pending sync queue breakdown (async -- reads IndexedDB).

```ts
async function getQueueDiagnostics(): Promise<{
  pendingOperations: number;
  pendingEntityIds: string[];
  byTable: Record<string, number>;
  byOperationType: Record<string, number>;
  oldestPendingTimestamp: string | null;
  itemsInBackoff: number;
}>
```

### `getConflictDiagnostics()`

Get recent conflict resolution history (async -- reads IndexedDB).

```ts
async function getConflictDiagnostics(): Promise<{
  recentHistory: ConflictHistoryEntry[];
  totalCount: number;
}>
```

### `getEngineDiagnostics()`

Get engine-internal state: lock status, tab visibility, auth validation (synchronous).

```ts
function getEngineDiagnostics(): {
  isTabVisible: boolean;
  tabHiddenAt: string | null;
  lockHeld: boolean;
  lockHeldForMs: number | null;
  recentlyModifiedCount: number;
  wasOffline: boolean;
  authValidatedAfterReconnect: boolean;
}
```

### `getNetworkDiagnostics()`

Get current online/offline status (synchronous).

```ts
function getNetworkDiagnostics(): { online: boolean }
```

### `getErrorDiagnostics()`

Get recent error state from the sync status store (synchronous).

```ts
function getErrorDiagnostics(): {
  lastError: string | null;
  lastErrorDetails: string | null;
  recentErrors: SyncError[];
}
```

### `DiagnosticsSnapshot` (type)

See the full type definition in `src/diagnostics.ts`. Key sections: `sync`, `egress`, `queue`, `realtime`, `network`, `engine`, `conflicts`, `errors`, `config`.

---

## Debug

### `debug(level, ...args)`

Unified debug logging function. Only outputs when debug mode is enabled.

```ts
function debug(level: 'log' | 'warn' | 'error', ...args: unknown[]): void
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `level` | `'log' \| 'warn' \| 'error'` | Console method to use |
| `...args` | `unknown[]` | Arguments passed to `console[level]` |

### `isDebugMode()`

Check if debug mode is enabled. Reads from `localStorage` key `{prefix}_debug_mode`.

```ts
function isDebugMode(): boolean
```

### `setDebugMode(enabled)`

Enable or disable debug mode. Persists to `localStorage`.

```ts
function setDebugMode(enabled: boolean): void
```

---

## Utilities

### `generateId()`

Generate a UUID v4.

```ts
function generateId(): string
```

**Returns:** A random UUID string (via `crypto.randomUUID()`).

### `now()`

Get the current timestamp as an ISO 8601 string.

```ts
function now(): string
```

**Returns:** ISO timestamp string (e.g., `"2025-01-15T12:34:56.789Z"`).

### `snakeToCamel(str)`

Convert a `snake_case` string to `camelCase`. Also strips invalid characters (non-alphanumeric except underscores) before converting. Used internally to derive Dexie table names from `supabaseName`.

```ts
function snakeToCamel(str: string): string
```

**Examples:**

```ts
snakeToCamel('goal_lists');    // 'goalLists'
snakeToCamel('projects');      // 'projects'
snakeToCamel('user_settings'); // 'userSettings'
```

### `calculateNewOrder(items, fromIndex, toIndex)`

Calculate a new fractional order value when moving an item to a new position in a sorted list. Minimizes the number of records that need updating.

```ts
function calculateNewOrder<T extends { order: number }>(
  items: T[],
  fromIndex: number,
  toIndex: number
): number
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `items` | `T[]` | Sorted array of items with `order` property |
| `fromIndex` | `number` | Current index of the item being moved |
| `toIndex` | `number` | Target index |

**Returns:** `number` -- The new order value for the moved item.

**Example:**

```ts
import { calculateNewOrder } from '@prabhask5/stellar-engine';

// items sorted by order: [{ order: 1 }, { order: 2 }, { order: 3 }]
const newOrder = calculateNewOrder(items, 0, 2);
// Returns 2.5 (between index 1 and 2)
```

### `formatBytes(bytes)`

Format a byte count into a human-readable string.

```ts
function formatBytes(bytes: number): string
```

**Returns:** Formatted string (e.g., `"45.23 KB"`, `"1.20 MB"`, `"512 B"`).

---

## SQL & TypeScript Generation

> **Subpath:** `@prabhask5/stellar-engine/utils`

Functions to generate complete Supabase SQL and TypeScript interfaces from a declarative `SchemaDefinition`. These eliminate the need to hand-write SQL -- the schema in code becomes the single source of truth.

### `generateSupabaseSQL(schema, options?)`

Generate complete Supabase SQL from a schema definition. Produces CREATE TABLE statements, RLS policies, triggers, indexes, and realtime subscriptions.

```ts
function generateSupabaseSQL(
  schema: SchemaDefinition,
  options?: SQLGenerationOptions
): string
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `schema` | `SchemaDefinition` | The declarative schema definition |
| `options` | `SQLGenerationOptions` | Optional generation options |

**`SQLGenerationOptions`:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `appName` | `string` | -- | Application name for SQL comments |
| `includeCRDT` | `boolean` | `false` | Include CRDT document storage table |
| `includeDeviceVerification` | `boolean` | `true` | Include `trusted_devices` table |
| `includeHelperFunctions` | `boolean` | `true` | Include helper functions (`set_user_id`, `update_updated_at`) |

**Example:**

```ts
import { generateSupabaseSQL } from '@prabhask5/stellar-engine/utils';

const sql = generateSupabaseSQL({
  tasks: 'project_id, order',
  projects: 'is_current, order',
}, { appName: 'My App', includeCRDT: true });

console.log(sql); // Full SQL ready to run in Supabase SQL editor
```

### `inferColumnType(fieldName)`

Infer a SQL column type from a field name using naming conventions. The engine uses consistent field naming patterns, so the column type can be reliably determined from the field suffix or exact name.

```ts
function inferColumnType(fieldName: string): string
```

| Pattern | SQL Type |
|---------|----------|
| `*_id` | `uuid` |
| `*_at` | `timestamptz` |
| `order` | `double precision default 0` |
| `completed`, `deleted`, `active`, `is_*` | `boolean default false` |
| `_version` | `integer default 1` |
| `date` | `date` |
| `*_count`, `*_value`, `*_size`, `*_ms`, `*_duration` | `integer default 0` |
| everything else | `text` |

### `generateMigrationSQL(oldSchema, newSchema)`

Diff two schema definitions and produce ALTER TABLE migration SQL. Handles table additions, removals, column additions, removals, and type changes.

```ts
function generateMigrationSQL(
  oldSchema: SchemaDefinition,
  newSchema: SchemaDefinition
): string
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `oldSchema` | `SchemaDefinition` | The previous schema version |
| `newSchema` | `SchemaDefinition` | The new schema version |

**Returns:** SQL string with ALTER statements, or empty string if no changes detected. Supports `renamedFrom` and `renamedColumns` hints for non-destructive renames.

### `generateTypeScript(schema, options?)`

Generate TypeScript interfaces and enum types from a schema definition. Only tables with a `fields` property in their config are included.

```ts
function generateTypeScript(
  schema: SchemaDefinition,
  options?: TypeScriptGenerationOptions
): string
```

**`TypeScriptGenerationOptions`:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `header` | `string` | Auto-generated comment | Header comment at the top of the file |
| `includeSystemColumns` | `boolean` | `true` | Include system columns (id, user_id, etc.) in interfaces |

**Example:**

```ts
import { generateTypeScript } from '@prabhask5/stellar-engine/utils';

const ts = generateTypeScript({
  tasks: {
    indexes: 'project_id, order',
    fields: {
      title: 'string',
      completed: 'boolean',
      priority: ['low', 'medium', 'high'],
    },
  },
});
// Generates:
// export type TaskPriority = 'low' | 'medium' | 'high';
// export interface Task {
//   id: string;
//   title: string;
//   completed: boolean;
//   priority: TaskPriority;
//   ...system columns...
// }
```

---

## Svelte Actions

### `remoteChangeAnimation`

Svelte action that automatically applies CSS animation classes when remote changes arrive for an entity. Detects the action type and applies the corresponding animation.

```ts
function remoteChangeAnimation(
  node: HTMLElement,
  options: RemoteChangeOptions
): SvelteActionReturn
```

**Options:**

| Property | Type | Description |
|----------|------|-------------|
| `entityId` | `string` | Entity ID to watch |
| `entityType` | `string` | Table/entity type name |
| `fields` | `string[]` | Only animate if these fields changed |
| `animationClass` | `string` | Override the default CSS class |
| `onAction` | `(actionType, fields) => void` | Callback when action is detected |

**Animation class mapping:**

| Action Type | CSS Class |
|-------------|-----------|
| `create` | `item-created` |
| `delete` | `item-deleting` |
| `toggle` | `item-toggled` |
| `increment` | `counter-increment` |
| `decrement` | `counter-decrement` |
| `reorder` | `item-reordering` |
| `rename` | `text-changed` |
| `update` | `item-changed` |

**Example:**

```svelte
<div use:remoteChangeAnimation={{ entityId: item.id, entityType: 'tasks' }}>
  {item.name}
</div>
```

### `trackEditing`

Svelte action for form elements that tracks editing state. Defers remote changes while a manual-save form is open so the user does not see disruptive updates mid-edit.

```ts
function trackEditing(
  node: HTMLElement,
  options: TrackEditingOptions
): SvelteActionReturn
```

**Options:**

| Property | Type | Description |
|----------|------|-------------|
| `entityId` | `string` | Entity being edited |
| `entityType` | `string` | Table/entity type name |
| `formType` | `'auto-save' \| 'manual-save'` | `'manual-save'` defers remote changes until form closes |
| `fields` | `string[]` | Fields being edited |
| `onDeferredChanges` | `(changes) => void` | Callback when form closes with pending deferred changes |

**Example:**

```svelte
<form use:trackEditing={{
  entityId: task.id,
  entityType: 'tasks',
  formType: 'manual-save'
}}>
  <input bind:value={task.name} />
  <button type="submit">Save</button>
</form>
```

### `triggerLocalAnimation(element, actionType)`

Programmatically trigger an animation on an element. Makes local actions animate the same way as remote actions.

```ts
function triggerLocalAnimation(
  element: HTMLElement | null,
  actionType: RemoteActionType
): void
```

### `truncateTooltip`

Svelte action that adds a native title tooltip when text content overflows its container (is truncated by CSS `text-overflow: ellipsis`). Uses `ResizeObserver` to detect overflow.

```ts
function truncateTooltip(node: HTMLElement): SvelteActionReturn
```

**Example:**

```svelte
<span class="truncate" use:truncateTooltip>
  {longTextThatMightOverflow}
</span>
```

---

## Svelte Components

The engine ships three ready-to-use Svelte 5 components. They use CSS custom properties (`--color-primary`, `--color-text`, etc.) for theming.

### `SyncStatus`

> **Import:** `import SyncStatus from '@prabhask5/stellar-engine/components/SyncStatus'`

Animated sync-state indicator button with tooltip and mobile refresh.

**Features:**
- 5 morphing icon states: offline (wifi-off), syncing (spinner), synced (checkmark), error (exclamation), pending (refresh arrows)
- Draw-in SVG animations with cross-fade transitions
- Live indicator (green dot) when realtime subscription is connected
- Hover tooltip with status details, realtime badge, and last sync time
- Expandable error details panel with per-entity error cards
- Mobile refresh button (visible < 640px)
- `prefers-reduced-motion` support

**Usage:**
```svelte
<script lang="ts">
  import SyncStatus from '@prabhask5/stellar-engine/components/SyncStatus';
</script>

<SyncStatus />
```

### `DeferredChangesBanner`

> **Import:** `import DeferredChangesBanner from '@prabhask5/stellar-engine/components/DeferredChangesBanner'`

Notification banner for cross-device data conflicts. Shows when another device pushes changes while the user is editing an entity.

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `entityId` | `string` | Unique identifier of the entity being edited |
| `entityType` | `string` | Entity collection name (e.g., `'goals'`) |
| `remoteData` | `Record<string, unknown> \| null` | Remote data snapshot |
| `localData` | `Record<string, unknown>` | Current local form data |
| `fieldLabels` | `Record<string, string>` | Map of field keys to human-readable labels |
| `formatValue` | `(field: string, value: unknown) => string` | Optional custom value formatter |
| `onLoadRemote` | `() => void` | Callback to apply remote data |
| `onDismiss` | `() => void` | Callback to dismiss notification |

**Features:**
- Polls `remoteChangesStore` every 500ms for deferred changes
- Animated expand/collapse via `grid-template-rows` transition
- Field-by-field diff preview (old to new values)
- Update / Dismiss / Show Changes actions

**Usage:**
```svelte
<DeferredChangesBanner
  entityId={item.id}
  entityType="tasks"
  remoteData={remoteSnapshot}
  localData={formData}
  fieldLabels={{ name: 'Name', description: 'Description' }}
  onLoadRemote={applyRemoteData}
  onDismiss={dismissBanner}
/>
```

### `DemoBanner`

> **Import:** `import DemoBanner from '@prabhask5/stellar-engine/components/DemoBanner'`

Fixed-position banner at bottom center. Shows "Demo Mode -- Changes reset on refresh" with a dismiss button. Only renders when `isDemoMode()` returns `true`. Glass morphism styling, z-index 9000.

**Usage:**
```svelte
<script lang="ts">
  import DemoBanner from '@prabhask5/stellar-engine/components/DemoBanner';
</script>

<DemoBanner />
```

### `UpdatePrompt` (generated, not exported)

> **Generated by:** `stellar-engine install pwa` at `src/lib/components/UpdatePrompt.svelte`

Service-worker update notification component. Generated with fully wired SW lifecycle logic but TODO placeholder UI. Uses `monitorSwLifecycle` and `handleSwUpdate` from `@prabhask5/stellar-engine/kit`.

---

## SvelteKit Helpers

> **Subpath:** `@prabhask5/stellar-engine/kit`

### Server Handlers

#### `getServerConfig()`

Returns runtime Supabase configuration from environment variables for the `/api/config` endpoint. Reads from `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` env vars.

```ts
function getServerConfig(): ServerConfig
```

**`ServerConfig`:**

```ts
interface ServerConfig {
  configured: boolean;                         // true when both env vars are set
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}
```

#### `deployToVercel(config)`

Deploy environment variables to a Vercel project. Upserts env vars and triggers a production redeployment via the Vercel REST API.

```ts
async function deployToVercel(config: DeployConfig): Promise<DeployResult>
```

**`DeployConfig`:**

| Property | Type | Description |
|----------|------|-------------|
| `vercelToken` | `string` | Vercel personal access token |
| `projectId` | `string` | Vercel project ID |
| `supabaseUrl` | `string` | Supabase project URL |
| `supabaseAnonKey` | `string` | Supabase anonymous key |

**`DeployResult`:**

```ts
interface DeployResult {
  success: boolean;
  deploymentUrl?: string;                      // Only on success
  error?: string;                              // Only on failure
}
```

#### `createValidateHandler()`

Create a SvelteKit POST handler that validates Supabase credentials and schema.

```ts
function createValidateHandler(): RequestHandler
```

**Returns:** A SvelteKit `RequestHandler` that accepts `{ supabaseUrl, supabaseAnonKey }` in the POST body and returns validation results.

### Load Function Helpers

#### `resolveRootLayout(url)`

Root layout load function helper. Initializes config, resolves auth state, starts sync engine. When in demo mode, seeds demo data automatically.

```ts
function resolveRootLayout(url: URL): Promise<RootLayoutData>
```

**`RootLayoutData`:**

```ts
interface RootLayoutData extends AuthStateResult {
  singleUserSetUp?: boolean;
}
```

#### `resolveProtectedLayout(url)`

Protected layout load function helper. Checks auth and redirects to login if unauthenticated.

```ts
function resolveProtectedLayout(url: URL): Promise<ProtectedLayoutData>
```

**`ProtectedLayoutData`:**

```ts
interface ProtectedLayoutData {
  session: Session | null;
  authMode: AuthMode;
  offlineProfile: OfflineCredentials | null;
}
```

#### `resolveSetupAccess()`

Setup page load function helper. Checks config and session status. Returns data telling the setup page whether this is a first-time configuration or a reconfiguration.

```ts
function resolveSetupAccess(): Promise<SetupAccessData>
```

**`SetupAccessData`:**

```ts
interface SetupAccessData {
  isReconfigure: boolean;
  hasSession: boolean;
}
```

### Email Confirmation

#### `handleEmailConfirmation(tokenHash, type)`

Verify an email confirmation token. Handles OTP verification, device trust (for device-verification flows), and error translation into user-friendly messages.

```ts
async function handleEmailConfirmation(
  tokenHash: string,
  type: 'signup' | 'email' | 'email_change' | 'magiclink'
): Promise<ConfirmResult>
```

**`ConfirmResult`:**

```ts
interface ConfirmResult {
  success: boolean;
  error?: string;                              // User-friendly error message (only on failure)
}
```

#### `broadcastAuthConfirmed(channelName, type)`

Broadcast auth confirmation to other tabs via BroadcastChannel. Used on the confirm page to notify the originating tab that confirmation succeeded.

```ts
async function broadcastAuthConfirmed(
  channelName: string,
  type: string
): Promise<'can_close' | 'no_broadcast'>
```

**Returns:** `'can_close'` if the broadcast was sent (tab can close itself), or `'no_broadcast'` if BroadcastChannel is unavailable.

### Service Worker Helpers

#### `pollForNewServiceWorker(options?)`

Poll for a new service worker after a deployment. Calls `registration.update()` on each tick until a waiting worker is found.

```ts
function pollForNewServiceWorker(options?: PollOptions): () => void
```

**`PollOptions`:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `intervalMs` | `number` | `5000` | Polling interval in milliseconds |
| `maxAttempts` | `number` | `60` | Maximum polling attempts (~5 minutes at default interval) |
| `onFound` | `() => void` | -- | Callback when a new waiting SW is detected |

**Returns:** A cleanup function that stops polling.

#### `handleSwUpdate()`

Sends `SKIP_WAITING` to the waiting service worker, listens for `controllerchange`, then reloads the page. Falls back to a simple reload if no waiting worker is found.

```ts
async function handleSwUpdate(): Promise<void>
```

#### `monitorSwLifecycle(callbacks)`

Comprehensive passive monitoring of the service worker lifecycle. Uses six different detection strategies for maximum reliability across browsers and platforms (including iOS PWA quirks).

```ts
function monitorSwLifecycle(callbacks: SwLifecycleCallbacks): () => void
```

**`SwLifecycleCallbacks`:**

```ts
interface SwLifecycleCallbacks {
  onUpdateAvailable: () => void;               // Called when any detection strategy finds an update
}
```

**Returns:** A cleanup function that removes all listeners.

### Auth Hydration

#### `hydrateAuthState(data)`

Hydrate the `authState` store from layout load data. Call in `$effect()` inside `+layout.svelte` so it re-runs whenever layout data changes.

```ts
function hydrateAuthState(data: AuthLayoutData): void
```

**`AuthLayoutData`:**

```ts
interface AuthLayoutData {
  authMode: AuthMode;                          // 'supabase' | 'offline' | 'demo' | 'none'
  session: Session | null;
  offlineProfile: OfflineCredentials | null;
}
```

**Example:**

```svelte
<script lang="ts">
  import { hydrateAuthState } from '@prabhask5/stellar-engine/kit';
  let { data } = $props();
  $effect(() => { hydrateAuthState(data); });
</script>
```

---

## Demo Mode

Demo mode provides a completely isolated sandbox for consumer apps. When active, the app uses a separate Dexie database (`${name}_demo`), makes zero Supabase connections, and skips all sync/auth/email/device-verification flows. Writes go to the sandboxed DB and are dropped on page refresh (mock data is re-seeded).

### `isDemoMode()`

Check whether demo mode is currently active. SSR-safe (returns `false` on server).

```ts
function isDemoMode(): boolean
```

### `setDemoMode(enabled)`

Activate or deactivate demo mode via localStorage flag. **Caller must trigger a full page reload** after calling this to ensure complete engine teardown and reinitialization.

```ts
function setDemoMode(enabled: boolean): void
```

### `seedDemoData()`

Seed the demo database with mock data using the consumer-provided `seedData` callback. Idempotent per page load (no-ops if already seeded). Called automatically by `resolveRootLayout()` when in demo mode.

```ts
async function seedDemoData(): Promise<void>
```

### `cleanupDemoDatabase(dbName)`

Delete the demo Dexie database entirely. Call when deactivating demo mode for a clean exit.

```ts
async function cleanupDemoDatabase(dbName: string): Promise<void>
```

### `getDemoConfig()`

Get the registered demo configuration, or `null` if demo mode is not configured.

```ts
function getDemoConfig(): DemoConfig | null
```

### `DemoConfig`

```ts
interface DemoConfig {
  seedData: (db: Dexie) => Promise<void>;      // Callback to populate demo DB with mock data
  mockProfile: {
    email: string;
    firstName: string;
    lastName: string;
    [key: string]: unknown;
  };
}
```

---

## CRDT Collaborative Editing

> **Import:** `@prabhask5/stellar-engine/crdt`

Optional Yjs-based CRDT subsystem for real-time collaborative document editing. Enable by adding `crdt: {}` (or `crdt: true`) to `initEngine()`. Consumers never need to install `yjs` directly -- all necessary Yjs types and constructors are re-exported.

### Configuration

#### `CRDTConfig`

All fields optional with defaults:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `supabaseTable` | `string` | `'crdt_documents'` | Supabase table name |
| `columns` | `string` | `'id,page_id,...'` | SELECT columns for egress optimization |
| `persistIntervalMs` | `number` | `30000` | Supabase persist interval |
| `broadcastDebounceMs` | `number` | `100` | Broadcast debounce window |
| `localSaveDebounceMs` | `number` | `5000` | IndexedDB full-state save debounce |
| `cursorDebounceMs` | `number` | `50` | Cursor/presence update debounce |
| `maxOfflineDocuments` | `number` | `50` | Max docs stored offline |
| `maxBroadcastPayloadBytes` | `number` | `250000` | Chunk threshold |
| `syncPeerTimeoutMs` | `number` | `3000` | Sync protocol timeout |
| `maxReconnectAttempts` | `number` | `5` | Max channel reconnect attempts |
| `reconnectBaseDelayMs` | `number` | `1000` | Exponential backoff base |

#### `isCRDTEnabled()`

Check whether the CRDT subsystem was configured. Available from the root import.

```ts
function isCRDTEnabled(): boolean
```

### Document Lifecycle

#### `openDocument(documentId, pageId, options?)`

Open a collaborative CRDT document. Idempotent -- returns existing provider if already open.

```ts
async function openDocument(
  documentId: string,
  pageId: string,
  options?: OpenDocumentOptions
): Promise<CRDTProvider>
```

**`OpenDocumentOptions`:**

| Property | Type | Description |
|----------|------|-------------|
| `offlineEnabled` | `boolean` | Persist to IndexedDB for offline access (default: `false`) |
| `initialPresence` | `{ name: string; avatarUrl?: string }` | Announce presence on join |

**`CRDTProvider`:**

| Property | Type | Description |
|----------|------|-------------|
| `doc` | `Y.Doc` | The Yjs document instance |
| `documentId` | `string` | Unique identifier |
| `pageId` | `string` | Associated page/entity |
| `connectionState` | `'disconnected' \| 'connecting' \| 'connected'` | Current state |
| `isDirty` | `boolean` | Unsaved changes exist |
| `destroy()` | `Promise<void>` | Close and clean up |

#### `closeDocument(documentId)`

Close a specific document. Saves final state and leaves the realtime channel.

```ts
async function closeDocument(documentId: string): Promise<void>
```

#### `closeAllDocuments()`

Close all active documents. Called automatically on sign-out.

```ts
async function closeAllDocuments(): Promise<void>
```

### Document Type Helpers

#### `createSharedText(doc, name?)`

Get or create a shared text type on a Yjs document.

```ts
function createSharedText(doc: Y.Doc, name?: string): Y.Text
```

Default name: `'text'`.

#### `createSharedXmlFragment(doc, name?)`

Get or create a shared XML fragment (for rich text editors).

```ts
function createSharedXmlFragment(doc: Y.Doc, name?: string): Y.XmlFragment
```

Default name: `'content'`.

#### `createSharedArray<T>(doc, name?)`

Get or create a shared array.

```ts
function createSharedArray<T>(doc: Y.Doc, name?: string): Y.Array<T>
```

Default name: `'array'`.

#### `createSharedMap<T>(doc, name?)`

Get or create a shared map.

```ts
function createSharedMap<T>(doc: Y.Doc, name?: string): Y.Map<T>
```

Default name: `'map'`.

#### `createBlockDocument(doc)`

Set up a standard block document structure with `content` (XML fragment for block tree) and `meta` (map for document metadata).

```ts
function createBlockDocument(doc: Y.Doc): {
  content: Y.XmlFragment;
  meta: Y.Map<unknown>;
}
```

### Yjs Re-exports

Consumers do not need to install `yjs` directly. The following are re-exported from `@prabhask5/stellar-engine/crdt`:

- `YDoc` -- `Y.Doc` constructor (runtime export)
- `YText`, `YXmlFragment`, `YArray`, `YMap`, `YXmlElement` -- Yjs type aliases (type-only exports)

### Awareness / Presence

#### `updateCursor(documentId, cursor, selection?)`

Update local user's cursor position. Debounced to `cursorDebounceMs`.

```ts
function updateCursor(documentId: string, cursor: unknown, selection?: unknown): void
```

#### `getCollaborators(documentId)`

Get current remote collaborators (excludes local user).

```ts
function getCollaborators(documentId: string): UserPresenceState[]
```

#### `onCollaboratorsChange(documentId, callback)`

Subscribe to collaborator join/leave/cursor changes.

```ts
function onCollaboratorsChange(
  documentId: string,
  callback: (collaborators: UserPresenceState[]) => void
): () => void
```

**Returns:** Unsubscribe function.

#### `assignColor(userId)`

Deterministic color assignment from userId hash (12-color palette).

```ts
function assignColor(userId: string): string
```

#### `UserPresenceState`

```ts
interface UserPresenceState {
  userId: string;
  name: string;
  avatarUrl?: string;
  color: string;
  cursor?: unknown;
  selection?: unknown;
  deviceId: string;
  lastActiveAt: string;
}
```

### Offline Management

#### `enableOffline(pageId, documentId)`

Enable offline access for a document. Saves current state to IndexedDB. Throws if the offline document limit is reached or if called offline without an open provider.

```ts
async function enableOffline(pageId: string, documentId: string): Promise<void>
```

#### `disableOffline(pageId, documentId)`

Remove a document from offline storage.

```ts
async function disableOffline(pageId: string, documentId: string): Promise<void>
```

#### `isOfflineEnabled(documentId)`

Check if a document is stored for offline access.

```ts
async function isOfflineEnabled(documentId: string): Promise<boolean>
```

#### `getOfflineDocuments()`

List all offline-enabled documents.

```ts
async function getOfflineDocuments(): Promise<CRDTDocumentRecord[]>
```

#### `loadDocumentByPageId(pageId)`

Look up a CRDT document record by page ID.

```ts
async function loadDocumentByPageId(pageId: string): Promise<CRDTDocumentRecord | undefined>
```

### Persistence (Advanced)

#### `persistDocument(documentId, doc)`

Manually persist a document's Yjs state to Supabase.

```ts
async function persistDocument(documentId: string, doc: Y.Doc): Promise<void>
```

#### `persistAllDirty()`

Persist all active dirty documents to Supabase.

```ts
async function persistAllDirty(): Promise<void>
```

### CRDT Diagnostics

#### `getCRDTDiagnostics()`

Get diagnostics for the CRDT subsystem (active documents, connection states, offline counts).

```ts
async function getCRDTDiagnostics(): Promise<CRDTDiagnostics>
```

---

## Types

> **Subpath:** All types are available from `@prabhask5/stellar-engine/types`.

### `Session`

Re-exported from `@supabase/supabase-js`. Represents a Supabase auth session.

```ts
import type { Session } from '@prabhask5/stellar-engine/types';
```

### `SyncOperationItem`

Intent-based sync operation queued for background sync.

```ts
interface SyncOperationItem {
  id?: number;                                 // Auto-increment primary key
  table: string;                               // Supabase table name
  entityId: string;                            // UUID of the entity
  operationType: OperationType;                // 'increment' | 'set' | 'create' | 'delete'
  field?: string;                              // Target field (for increment/single-field set)
  value?: unknown;                             // Payload (delta, new value, full entity)
  timestamp: string;                           // ISO 8601 enqueue timestamp
  retries: number;                             // Failed push attempts (drives backoff)
  lastRetryAt?: string;                        // ISO 8601 timestamp of last retry
}
```

### `OperationType`

```ts
type OperationType = 'increment' | 'set' | 'create' | 'delete';
```

### `OfflineCredentials`

```ts
interface OfflineCredentials {
  id: string;                                  // Always 'current_user' (singleton)
  userId: string;                              // Supabase user UUID
  email: string;
  password: string;                            // SHA-256 hash of password
  profile: Record<string, unknown>;
  cachedAt: string;                            // ISO 8601 timestamp
}
```

### `OfflineSession`

```ts
interface OfflineSession {
  id: string;                                  // Always 'current_session' (singleton)
  userId: string;
  offlineToken: string;                        // Random UUID session token
  createdAt: string;
}
```

### `ConflictHistoryEntry`

```ts
interface ConflictHistoryEntry {
  id?: number;
  entityId: string;
  entityType: string;
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  resolvedValue: unknown;
  winner: 'local' | 'remote' | 'merged';
  strategy: string;                            // e.g., 'last_write', 'delete_wins'
  timestamp: string;
}
```

### `SyncStatus`

```ts
type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';
```

### `AuthMode`

```ts
type AuthMode = 'supabase' | 'offline' | 'demo' | 'none';
```

### `SingleUserGateType`

```ts
type SingleUserGateType = 'code' | 'password';
```

### `SingleUserConfig`

```ts
interface SingleUserConfig {
  id: string;                                  // Always 'config' (singleton)
  gateType: SingleUserGateType;
  codeLength?: 4 | 6;                         // Only when gateType is 'code'
  gateHash?: string;                           // SHA-256 hex (kept for offline fallback)
  email?: string;                              // Real email for Supabase auth
  profile: Record<string, unknown>;
  supabaseUserId?: string;
  setupAt: string;
  updatedAt: string;
}
```

### `FieldType`

```ts
type FieldType =
  | string                                     // 'string', 'number?', 'uuid', 'boolean', etc.
  | string[]                                   // Enum: ['a', 'b', 'c']
  | { enum: string[]; nullable?: boolean; enumName?: string };
```

### `AuthConfig`

Simplified flat authentication configuration. See source for full definition.

---

## CLI Commands

### `stellar-engine install pwa`

CLI command that scaffolds a complete offline-first PWA SvelteKit project via an interactive walkthrough.

```bash
npx @prabhask5/stellar-engine install pwa
```

The wizard collects all required configuration through step-by-step prompts with inline validation, shows a confirmation summary, then scaffolds the project with animated progress output.

### Interactive Prompts

| Prompt | Required | Validation | Description |
|--------|----------|------------|-------------|
| App Name | Yes | Non-empty | Full app name (e.g., "Stellar Planner") |
| Short Name | Yes | Non-empty, under 12 chars | Short name for PWA home screen |
| Prefix | Yes | Lowercase, starts with letter, no spaces | App prefix for localStorage, SW, debug |
| Description | No | -- | App description |

### Generated Files (34+)

**Config (8):** `vite.config.ts`, `tsconfig.json`, `svelte.config.js`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `knip.json`, `.gitignore`

**Documentation (3):** `README.md`, `ARCHITECTURE.md`, `FRAMEWORKS.md`

**Static (13):** `manifest.json`, `offline.html`, 7 SVG icon placeholders, 3 email template placeholders

**Database (1):** `supabase-schema.sql`

**Source (2):** `src/app.html`, `src/app.d.ts`

**Routes (16):** All route files with stellar-engine logic pre-wired and UI marked as TODO

**Library (1):** `src/lib/types.ts`

**Git hooks (1):** `.husky/pre-commit`

### Behavior

- **Skip-if-exists**: Files are only written if they do not already exist
- **Auto-installs**: Runs `npm install` and `npx husky init` automatically
- **Prints summary**: Shows created/skipped file counts and next steps

---

## Re-exports

The following types are re-exported from third-party dependencies so consumers do not need to install them directly:

| Type | Source Package | Description |
|------|---------------|-------------|
| `Session` | `@supabase/supabase-js` | Supabase auth session object |
| `YDoc` | `yjs` | Yjs document constructor (from `@prabhask5/stellar-engine/crdt`) |
| `YText` | `yjs` | Yjs shared text type (type-only, from `crdt` subpath) |
| `YXmlFragment` | `yjs` | Yjs XML fragment type (type-only, from `crdt` subpath) |
| `YArray` | `yjs` | Yjs shared array type (type-only, from `crdt` subpath) |
| `YMap` | `yjs` | Yjs shared map type (type-only, from `crdt` subpath) |
| `YXmlElement` | `yjs` | Yjs XML element type (type-only, from `crdt` subpath) |
