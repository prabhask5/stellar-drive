/**
 * CRDT Offline Cache Management
 *
 * Manages selective offline caching of Yjs document state.
 * Uses a dedicated IndexedDB store separate from y-indexeddb persistence.
 *
 * The active y-indexeddb persistence (from doc.ts) handles documents that are
 * currently open. This module handles explicit offline download/caching for
 * documents the user wants available offline even when not actively editing.
 */
import * as Y from 'yjs';
import { debugLog, debugWarn, debugError } from '../debug';
import { getEngineConfig } from '../config';
import { getCrdtDoc } from './doc';
import { supabase } from '../supabase/client';
function getOfflineDbName() {
    return `${getEngineConfig().prefix}_offline_crdt`;
}
function getObjectStoreName() {
    return 'cached_docs';
}
/**
 * Open the offline cache IndexedDB database.
 * Creates the object store if it doesn't exist.
 */
function openOfflineDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(getOfflineDbName(), 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(getObjectStoreName())) {
                db.createObjectStore(getObjectStoreName(), { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
/**
 * Cache a CRDT document for offline access.
 *
 * Serializes the current Yjs state and stores it in IndexedDB.
 * If the document is currently active, uses its live state.
 * Otherwise, fetches the state from Supabase.
 *
 * @param docId - Document/note ID
 */
export async function cacheCrdtForOffline(docId) {
    try {
        debugLog('[CRDT Offline] Caching for offline:', docId);
        let state;
        // Prefer live doc state if available
        const doc = getCrdtDoc(docId);
        if (doc) {
            state = Y.encodeStateAsUpdate(doc);
        }
        else {
            // Fetch from Supabase
            const { data, error } = await supabase
                .from('note_content')
                .select('yjs_state')
                .eq('note_id', docId)
                .eq('deleted', false)
                .maybeSingle();
            if (error) {
                debugError('[CRDT Offline] Failed to fetch state:', error);
                return;
            }
            if (!data?.yjs_state) {
                debugLog('[CRDT Offline] No state to cache for:', docId);
                // Store an empty doc state
                const emptyDoc = new Y.Doc();
                state = Y.encodeStateAsUpdate(emptyDoc);
                emptyDoc.destroy();
            }
            else {
                // Decode base64
                const binary = atob(data.yjs_state);
                state = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    state[i] = binary.charCodeAt(i);
                }
            }
        }
        // Store in offline cache
        const db = await openOfflineDb();
        const tx = db.transaction(getObjectStoreName(), 'readwrite');
        const store = tx.objectStore(getObjectStoreName());
        store.put({
            id: docId,
            yjs_state: Array.from(state), // Store as regular array for IndexedDB compatibility
            cached_at: new Date().toISOString()
        });
        await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        debugLog('[CRDT Offline] Cached for offline:', docId, `(${state.length} bytes)`);
    }
    catch (e) {
        debugError('[CRDT Offline] Cache error:', e);
    }
}
/**
 * Remove a document from the offline cache.
 *
 * @param docId - Document/note ID
 */
export async function removeCrdtOfflineCache(docId) {
    try {
        debugLog('[CRDT Offline] Removing cache for:', docId);
        const db = await openOfflineDb();
        const tx = db.transaction(getObjectStoreName(), 'readwrite');
        const store = tx.objectStore(getObjectStoreName());
        store.delete(docId);
        await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }
    catch (e) {
        debugError('[CRDT Offline] Remove cache error:', e);
    }
}
/**
 * Check if a document is cached for offline access.
 *
 * @param docId - Document/note ID
 * @returns true if the document is cached
 */
export async function isCrdtCachedOffline(docId) {
    try {
        const db = await openOfflineDb();
        const tx = db.transaction(getObjectStoreName(), 'readonly');
        const store = tx.objectStore(getObjectStoreName());
        const result = await new Promise((resolve, reject) => {
            const request = store.get(docId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return !!result;
    }
    catch (e) {
        debugWarn('[CRDT Offline] Check cache error:', e);
        return false;
    }
}
/**
 * Load a cached CRDT document state from offline storage.
 *
 * Creates a new Y.Doc and applies the cached state to it.
 * The caller is responsible for destroying the returned doc.
 *
 * @param docId - Document/note ID
 * @returns A Y.Doc with the cached state, or null if not cached
 */
export async function loadCrdtFromOfflineCache(docId) {
    try {
        const db = await openOfflineDb();
        const tx = db.transaction(getObjectStoreName(), 'readonly');
        const store = tx.objectStore(getObjectStoreName());
        const result = await new Promise((resolve, reject) => {
            const request = store.get(docId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        if (!result) {
            debugLog('[CRDT Offline] No cached state found for:', docId);
            return null;
        }
        const doc = new Y.Doc();
        const state = new Uint8Array(result.yjs_state);
        Y.applyUpdate(doc, state, 'offline-cache');
        debugLog('[CRDT Offline] Loaded from cache:', docId, `(cached at ${result.cached_at})`);
        return doc;
    }
    catch (e) {
        debugError('[CRDT Offline] Load cache error:', e);
        return null;
    }
}
//# sourceMappingURL=offline.js.map