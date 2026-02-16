/**
 * @fileoverview Store Factory Functions
 *
 * Generic factory functions that create Svelte-compatible reactive stores for
 * common data-loading patterns. These eliminate the repetitive boilerplate that
 * every collection or detail store requires: loading state management,
 * sync-complete listener registration, and refresh logic.
 *
 * Both factories produce stores that follow the Svelte store contract
 * (`subscribe`/`unsubscribe`) and expose a read-only `loading` sub-store.
 *
 * @see {@link ../engine} for `onSyncComplete` lifecycle hook
 */
import { writable } from 'svelte/store';
import { onSyncComplete } from '../engine';
import { engineCreate, engineUpdate, engineDelete, reorderEntity, prependOrder } from '../data';
import { generateId, now } from '../utils';
import { remoteChangesStore } from './remoteChanges';
// =============================================================================
// Collection Store Factory
// =============================================================================
/**
 * Create a reactive collection store with built-in loading state and
 * sync-complete auto-refresh.
 *
 * The returned store follows the Svelte store contract and can be used with
 * the `$store` auto-subscription syntax. On the first `load()` call, a
 * sync-complete listener is registered so the collection automatically
 * refreshes whenever the sync engine completes a cycle.
 *
 * Uses `typeof window !== 'undefined'` for environment detection since
 * stellar-drive is a library (not tied to SvelteKit's `browser` export).
 *
 * @typeParam T - The entity type stored in the collection.
 * @param config - Configuration with a `load` function.
 * @returns A `CollectionStore<T>` instance.
 *
 * @example
 * ```ts
 * import { createCollectionStore } from 'stellar-drive/stores';
 *
 * const store = createCollectionStore<Task>({
 *   load: () => queryAll<Task>('tasks'),
 * });
 *
 * // In your component:
 * await store.load();
 * // $store is now Task[], $store.loading is boolean
 * ```
 */
export function createCollectionStore(config) {
    const { subscribe, set, update } = writable([]);
    const loading = writable(true);
    let syncUnsubscribe = null;
    return {
        subscribe,
        loading: { subscribe: loading.subscribe },
        async load() {
            loading.set(true);
            try {
                const data = await config.load();
                set(data);
                /* Register sync-complete listener once, only in the browser.
                   On each sync cycle, the collection auto-refreshes from local DB. */
                if (typeof window !== 'undefined' && !syncUnsubscribe) {
                    syncUnsubscribe = onSyncComplete(async () => {
                        const refreshed = await config.load();
                        set(refreshed);
                    });
                }
            }
            finally {
                loading.set(false);
            }
        },
        async refresh() {
            const data = await config.load();
            set(data);
        },
        set(data) {
            set(data);
        },
        mutate(fn) {
            update(fn);
        }
    };
}
// =============================================================================
// Detail Store Factory
// =============================================================================
/**
 * Create a reactive detail store for a single entity, with built-in loading
 * state, ID tracking, and sync-complete auto-refresh.
 *
 * The store tracks the currently loaded entity ID so that sync-complete
 * listeners can refresh the correct entity. Calling `load(id)` with a
 * different ID updates the tracked ID and fetches the new entity.
 *
 * @typeParam T - The entity type for the detail view.
 * @param config - Configuration with a `load` function that takes an entity ID.
 * @returns A `DetailStore<T>` instance.
 *
 * @example
 * ```ts
 * import { createDetailStore } from 'stellar-drive/stores';
 *
 * const store = createDetailStore<Task>({
 *   load: (id) => queryOne<Task>('tasks', id),
 * });
 *
 * // In your component:
 * await store.load(taskId);
 * // $store is now Task | null, $store.loading is boolean
 * ```
 */
export function createDetailStore(config) {
    const { subscribe, set, update } = writable(null);
    const loading = writable(true);
    let currentId = null;
    let syncUnsubscribe = null;
    return {
        subscribe,
        loading: { subscribe: loading.subscribe },
        async load(id) {
            currentId = id;
            loading.set(true);
            try {
                const data = await config.load(id);
                set(data);
                /* Register sync-complete listener once, only in the browser.
                   Uses the tracked `currentId` so it always refreshes the active entity. */
                if (typeof window !== 'undefined' && !syncUnsubscribe) {
                    syncUnsubscribe = onSyncComplete(async () => {
                        if (currentId) {
                            const refreshed = await config.load(currentId);
                            set(refreshed);
                        }
                    });
                }
            }
            finally {
                loading.set(false);
            }
        },
        clear() {
            currentId = null;
            set(null);
        },
        set(data) {
            set(data);
        },
        mutate(fn) {
            update(fn);
        },
        getCurrentId() {
            return currentId;
        }
    };
}
/**
 * Create a reactive CRUD collection store with built-in create, update,
 * delete, and reorder operations.
 *
 * Combines the loading/refresh/sync-listener behavior of
 * {@link createCollectionStore} with standard CRUD operations that
 * write to the local DB, enqueue sync operations, track remote changes,
 * and optimistically update the store.
 *
 * @typeParam T - The entity type (must have at least `id` and `order` fields).
 * @param config - Configuration with table name, load function, and optional order index.
 * @returns A `CrudCollectionStore<T>` instance.
 *
 * @example
 * ```ts
 * import { createCrudCollectionStore } from 'stellar-drive/stores';
 * import { queryAll } from 'stellar-drive/data';
 *
 * interface TaskCategory {
 *   id: string;
 *   name: string;
 *   color: string;
 *   order: number;
 *   user_id: string;
 * }
 *
 * const categoriesStore = createCrudCollectionStore<TaskCategory>({
 *   table: 'task_categories',
 *   load: () => queryAll<TaskCategory>('task_categories', { autoRemoteFallback: true }),
 *   orderIndexField: 'user_id',
 * });
 *
 * // Usage:
 * await categoriesStore.load();
 * await categoriesStore.create({ name: 'Work', color: '#ff0000', user_id: userId });
 * await categoriesStore.update(id, { name: 'Personal' });
 * await categoriesStore.delete(id);
 * await categoriesStore.reorder(id, 2.5);
 * ```
 *
 * @see {@link createCollectionStore} for the base collection store
 * @see {@link engineCreate} for the underlying create operation
 * @see {@link engineUpdate} for the underlying update operation
 * @see {@link engineDelete} for the underlying delete operation
 * @see {@link reorderEntity} for the underlying reorder operation
 */
export function createCrudCollectionStore(config) {
    const base = createCollectionStore(config);
    const { subscribe, loading, load, refresh, set, mutate } = base;
    return {
        subscribe,
        loading,
        load,
        refresh,
        set,
        mutate,
        async create(data) {
            const id = generateId();
            const timestamp = now();
            /* Compute prepend order if an index field is configured. */
            let order = data.order;
            if (order === undefined && config.orderIndexField) {
                const indexValue = data[config.orderIndexField];
                if (indexValue) {
                    order = await prependOrder(config.table, config.orderIndexField, indexValue);
                }
                else {
                    order = 0;
                }
            }
            const payload = {
                ...data,
                id,
                created_at: timestamp,
                updated_at: timestamp,
                ...(order !== undefined ? { order } : {})
            };
            remoteChangesStore.recordLocalChange(id, config.table, 'create');
            const created = await engineCreate(config.table, payload);
            /* Optimistic prepend — new items go to the top. */
            mutate((items) => [created, ...items]);
            return created;
        },
        async update(id, fields) {
            const updated = await engineUpdate(config.table, id, fields);
            if (updated) {
                mutate((items) => items.map((item) => (item.id === id ? updated : item)));
            }
            return updated;
        },
        async delete(id) {
            await engineDelete(config.table, id);
            mutate((items) => items.filter((item) => item.id !== id));
        },
        async reorder(id, newOrder) {
            const updated = await reorderEntity(config.table, id, newOrder);
            if (updated) {
                mutate((items) => items
                    .map((item) => (item.id === id ? updated : item))
                    .sort((a, b) => (a.order ?? 0) -
                    (b.order ?? 0)));
            }
            return updated;
        }
    };
}
//# sourceMappingURL=factories.js.map