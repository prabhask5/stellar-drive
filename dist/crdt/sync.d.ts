/**
 * CRDT Realtime Sync via Supabase Broadcast
 *
 * Manages Supabase Realtime broadcast channels for syncing Yjs document updates.
 * Handles:
 * - Broadcasting local Yjs updates to other clients
 * - Receiving and applying remote Yjs updates
 * - Echo suppression via device_id
 * - Checkpoint persistence (full state → note_content table)
 * - Reconnection with state vector diff sync
 * - Debounced checkpoint saves
 */
import type { CrdtSyncState } from './types';
/**
 * Save a checkpoint of the full Yjs state to the note_content table.
 * Uses direct Supabase client calls (bypasses normal engine data path since yjs_state is binary).
 *
 * @param docId - Document/note ID
 */
export declare function saveCrdtCheckpoint(docId: string): Promise<void>;
/**
 * Load initial CRDT state from the remote note_content table.
 * Fetches yjs_state and applies it to the local Y.Doc.
 *
 * @param docId - Document/note ID
 */
export declare function loadCrdtFromRemote(docId: string): Promise<void>;
/**
 * Connect a CRDT document to Supabase Realtime for live sync.
 *
 * Opens a broadcast channel, attaches update listeners, and handles
 * incoming remote updates with echo suppression.
 *
 * @param docId - Document/note ID
 */
export declare function connectCrdtRealtime(docId: string): void;
/**
 * Disconnect a CRDT document from Supabase Realtime.
 *
 * Saves a final checkpoint, removes listeners, and closes the channel.
 *
 * @param docId - Document/note ID
 */
export declare function disconnectCrdtRealtime(docId: string): Promise<void>;
/**
 * Get the sync state for a connected document.
 *
 * @param docId - Document/note ID
 * @returns The sync state if connected, undefined otherwise
 */
export declare function getCrdtSyncState(docId: string): CrdtSyncState | undefined;
/**
 * Check if a document is connected to realtime.
 *
 * @param docId - Document/note ID
 */
export declare function isCrdtRealtimeConnected(docId: string): boolean;
//# sourceMappingURL=sync.d.ts.map