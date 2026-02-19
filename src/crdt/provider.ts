/**
 * @fileoverview CRDT Document Provider — Per-Document Lifecycle Manager
 *
 * The `CRDTProvider` is the central orchestrator for a single collaborative
 * document. It manages:
 *   - Yjs `Y.Doc` creation and state loading (from IndexedDB or Supabase)
 *   - Wiring `doc.on('update')` to persistence, broadcast, and crash recovery
 *   - Supabase Broadcast channel for real-time update distribution
 *   - Periodic Supabase persistence timer
 *   - Local IndexedDB full-state saves (debounced)
 *   - Document lifecycle (open → edit → close → destroy)
 *
 * Module-level `Map<string, CRDTProvider>` tracks all active providers.
 * Factory functions {@link openDocument} / {@link closeDocument} manage the lifecycle.
 *
 * @see {@link ./channel.ts} for Broadcast channel management
 * @see {@link ./store.ts} for IndexedDB persistence
 * @see {@link ./persistence.ts} for Supabase persistence
 * @see {@link ./awareness.ts} for cursor/presence management
 *
 * @example
 * import { openDocument, closeDocument } from 'stellar-drive/crdt';
 *
 * const provider = await openDocument('doc-1', 'page-1', { offlineEnabled: true });
 * // provider.doc is a Y.Doc — use with your editor
 * // ...
 * await closeDocument('doc-1');
 */

import * as Y from 'yjs';
import { debugLog, debugWarn } from '../debug';
import { isOnline } from '../stores/network';
import { getCRDTConfig } from './config';
import { CRDTChannel } from './channel';
import {
  loadDocumentState,
  saveDocumentState,
  appendPendingUpdate,
  loadPendingUpdates,
  clearPendingUpdates
} from './store';
import { fetchRemoteState, persistDocument } from './persistence';
import { joinPresence, leavePresence } from './awareness';
import type { CRDTConnectionState, CRDTDocumentRecord, OpenDocumentOptions } from './types';

// =============================================================================
//  Active Provider Registry
// =============================================================================

/**
 * Tracks all currently active CRDT providers, keyed by `documentId`.
 *
 * This ensures:
 *   1. `openDocument()` is idempotent — returns existing provider if already open
 *   2. `closeAllDocuments()` can tear down everything on sign-out
 *   3. Reconnection logic can iterate active providers
 */
const activeProviders: Map<string, CRDTProviderImpl> = new Map();

/** Tracks in-flight openDocument init promises for concurrent-safety. */
const initPromises: Map<string, Promise<CRDTProvider>> = new Map();

// =============================================================================
//  CRDTProvider Interface (public)
// =============================================================================

/**
 * Public interface for a CRDT document provider.
 *
 * Consumers receive this from {@link openDocument}. All mutable state
 * (timers, channels, pending updates) is hidden in the implementation.
 */
export interface CRDTProvider {
  /** The Yjs document instance — use with your editor. */
  readonly doc: Y.Doc;
  /** Unique document identifier. */
  readonly documentId: string;
  /** The page/entity this document belongs to. */
  readonly pageId: string;
  /** Current Broadcast channel connection state. */
  readonly connectionState: CRDTConnectionState;
  /** Whether the document has unsaved changes. */
  readonly isDirty: boolean;
  /** Resolves when network sync (channel join + sync protocol) completes. */
  readonly networkReady: Promise<void>;
  /** Destroy this provider and release all resources. */
  destroy(): Promise<void>;
}

// =============================================================================
//  CRDTProvider Implementation (internal)
// =============================================================================

/**
 * Internal implementation of the CRDT provider.
 *
 * Manages the full lifecycle of a collaborative document: loading initial
 * state, wiring update handlers, managing the Broadcast channel, and
 * coordinating persistence.
 *
 * @internal
 */
class CRDTProviderImpl implements CRDTProvider {
  readonly doc: Y.Doc;
  readonly documentId: string;
  readonly pageId: string;
  private _connectionState: CRDTConnectionState = 'disconnected';
  private _isDirty = false;
  private offlineEnabled: boolean;

  /** Broadcast channel for this document. */
  private channel: CRDTChannel | null = null;

  /** Timer for periodic Supabase persistence. */
  private persistTimer: ReturnType<typeof setInterval> | null = null;

  /** Timer for debounced local IndexedDB full-state saves. */
  private localSaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Yjs update handler reference (for cleanup). */
  private updateHandler: ((update: Uint8Array, origin: unknown) => void) | null = null;

  /** Whether this provider has been destroyed. */
  private destroyed = false;

  /** Last state vector at the time of last Supabase persist (for dirty detection). */
  private lastPersistedStateVector: Uint8Array | null = null;

  /** Guard against concurrent persist operations. */
  private persistInProgress = false;

  /** The in-flight persist promise (for awaiting in destroy). */
  private persistPromise: Promise<void> | null = null;

  /** Guard against concurrent reconnect operations. */
  private reconnectInProgress = false;

  /** Whether the current online state is true. */
  private _isOnline = true;

  /** Store subscription cleanup function. */
  private onlineUnsubscribe: (() => void) | null = null;

  /** Generation counter for saveToIndexedDB race prevention. */
  private saveGeneration = 0;

  constructor(documentId: string, pageId: string, offlineEnabled: boolean) {
    this.documentId = documentId;
    this.pageId = pageId;
    this.offlineEnabled = offlineEnabled;
    this.doc = new Y.Doc();
  }

  get connectionState(): CRDTConnectionState {
    return this._connectionState;
  }

  get isDirty(): boolean {
    return this._isDirty;
  }

  // ===========================================================================
  //  Initialization
  // ===========================================================================

  /**
   * Initialize the provider: load state, wire handlers, join channel.
   *
   * Called by {@link openDocument} after construction.
   */
  async init(options: OpenDocumentOptions): Promise<void> {
    /* Subscribe to online status. */
    this.onlineUnsubscribe = isOnline.subscribe((online) => {
      const wasOffline = !this._isOnline;
      this._isOnline = online;

      /* Reconnect on online transition. */
      if (online && wasOffline && !this.destroyed) {
        this.handleReconnect();
      }
    });

    /* Step 1: Load initial state. */
    await this.loadInitialState();
    if (this.destroyed) return;

    /* Step 2: Wire the update handler. */
    this.wireUpdateHandler();

    /* Step 3: Start periodic Supabase persist timer. */
    this.startPersistTimer();

    /* Record initial state vector for dirty detection. */
    this.lastPersistedStateVector = Y.encodeStateVector(this.doc);

    /* Step 4: Join the Broadcast channel (if online) — background, non-blocking. */
    if (this._isOnline) {
      this.networkReady = this.initNetwork(options).catch((e) => {
        debugWarn(`[CRDT] Document ${this.documentId}: network init failed:`, e);
      });
    } else {
      this.networkReady = Promise.resolve();
    }

    debugLog(
      `[CRDT] Opening document ${this.documentId} (pageId=${this.pageId}, offlineEnabled=${this.offlineEnabled})`
    );
  }

  /** Resolves when network sync (channel join + sync protocol) completes. */
  networkReady: Promise<void> = Promise.resolve();

  /**
   * Initialize network layer (channel + sync + presence) — runs in background.
   */
  private async initNetwork(options: OpenDocumentOptions): Promise<void> {
    await this.joinChannel();
    if (this.destroyed) return;

    /* Run sync protocol. */
    if (this.channel) {
      const peersResponded = await this.channel.waitForSync();
      if (this.destroyed) return;
      if (!peersResponded) {
        /* No peers online — fetch latest state from Supabase if available. */
        await this.fetchAndMergeRemoteState();
        if (this.destroyed) return;
      }
    }

    /* Join presence if initial presence was provided. */
    if (options.initialPresence) {
      joinPresence(this.documentId, this.channel?.connectionState === 'connected', {
        name: options.initialPresence.name,
        avatarUrl: options.initialPresence.avatarUrl
      });
      /* Set presence info on the channel so Supabase Presence tracks this user. */
      this.channel?.setPresenceInfo({
        name: options.initialPresence.name,
        avatarUrl: options.initialPresence.avatarUrl
      });
    }
  }

  // ===========================================================================
  //  State Loading
  // ===========================================================================

  /**
   * Load the initial document state from IndexedDB or Supabase.
   *
   * Priority:
   *   1. IndexedDB (if offline-enabled and has stored state)
   *   2. Supabase (if online and no local state)
   *   3. Empty doc (if offline and no local state)
   */
  private async loadInitialState(): Promise<void> {
    /* Try IndexedDB first. */
    const localRecord = await loadDocumentState(this.documentId);

    if (localRecord) {
      /* Apply stored full state. */
      Y.applyUpdate(this.doc, localRecord.state);

      /* Replay any pending updates that weren't captured in the last full save.
       * Use 'load' origin to prevent update handler from re-queuing/re-broadcasting. */
      const pendingUpdates = await loadPendingUpdates(this.documentId);
      if (pendingUpdates.length > 0) {
        const merged = Y.mergeUpdates(pendingUpdates.map((p) => p.update));
        Y.applyUpdate(this.doc, merged, 'load');
        debugLog(
          `[CRDT] Document ${this.documentId} loaded from IndexedDB (${localRecord.stateSize} bytes, ${pendingUpdates.length} pending updates)`
        );
      } else {
        debugLog(
          `[CRDT] Document ${this.documentId} loaded from IndexedDB (${localRecord.stateSize} bytes, 0 pending updates)`
        );
      }
      return;
    }

    /* No local state — try Supabase if online. */
    if (this._isOnline) {
      await this.fetchAndMergeRemoteState();
      return;
    }

    /* Offline with no local state — start with empty doc. */
    debugLog(
      `[CRDT] Document ${this.documentId} started with empty state (offline, no local cache)`
    );
  }

  /**
   * Fetch the latest document state from Supabase and merge into local doc.
   */
  private async fetchAndMergeRemoteState(): Promise<void> {
    try {
      const remoteState = await fetchRemoteState(this.pageId);
      if (remoteState) {
        Y.applyUpdate(this.doc, remoteState);
        debugLog(
          `[CRDT] Document ${this.documentId} loaded from Supabase (${remoteState.byteLength} bytes)`
        );
      }
    } catch (e) {
      debugWarn(`[CRDT] Document ${this.documentId}: failed to fetch remote state:`, e);
    }
  }

  // ===========================================================================
  //  Update Handler
  // ===========================================================================

  /**
   * Wire the `doc.on('update')` handler that drives all downstream effects.
   *
   * On each Yjs update:
   *   1. Queue incremental update to IndexedDB (crash safety)
   *   2. Broadcast to remote peers (debounced 100ms)
   *   3. Broadcast to same-device tabs (immediate)
   *   4. Schedule debounced full-state save to IndexedDB (5s)
   */
  private wireUpdateHandler(): void {
    this.updateHandler = (update: Uint8Array, origin: unknown) => {
      /* Skip updates that originated from remote peers or replayed loads. */
      if (origin === 'remote' || origin === 'load') return;

      this._isDirty = true;

      /* 1. Crash-safe: append incremental update to IndexedDB. */
      if (this.offlineEnabled) {
        appendPendingUpdate(this.documentId, update).catch(() => {
          /* Non-critical — full state save will capture it. */
        });
      }

      /* 2. Broadcast to remote peers (debounced). */
      this.channel?.broadcastUpdate(update);

      /* 3. Schedule debounced local full-state save. */
      if (this.offlineEnabled) {
        this.scheduleLocalSave();
      }
    };

    this.doc.on('update', this.updateHandler);
  }

  // ===========================================================================
  //  Local Persistence (IndexedDB)
  // ===========================================================================

  /**
   * Schedule a debounced full-state save to IndexedDB.
   *
   * Resets the timer on each call so rapid edits don't cause excessive writes.
   */
  private scheduleLocalSave(): void {
    if (this.localSaveTimer) {
      clearTimeout(this.localSaveTimer);
    }

    const config = getCRDTConfig();
    this.localSaveTimer = setTimeout(() => {
      this.localSaveTimer = null;
      this.saveToIndexedDB();
    }, config.localSaveDebounceMs);
  }

  /**
   * Save the current full document state to IndexedDB.
   *
   * Also clears pending updates since they're now captured in the full state.
   */
  private async saveToIndexedDB(force = false): Promise<void> {
    if (!force && this.destroyed) return;

    /* Record generation before snapshot — only clear updates that existed before this save. */
    const gen = ++this.saveGeneration;

    const state = Y.encodeStateAsUpdate(this.doc);
    const stateVector = Y.encodeStateVector(this.doc);

    const record: CRDTDocumentRecord = {
      documentId: this.documentId,
      pageId: this.pageId,
      state,
      stateVector,
      offlineEnabled: this.offlineEnabled ? 1 : 0,
      localUpdatedAt: new Date().toISOString(),
      lastPersistedAt: null, // Will be set by Supabase persist
      stateSize: state.byteLength
    };

    /* Preserve existing lastPersistedAt if we're just doing a local save. */
    const existing = await loadDocumentState(this.documentId);
    if (existing?.lastPersistedAt) {
      record.lastPersistedAt = existing.lastPersistedAt;
    }

    await saveDocumentState(record);

    /* Only clear pending updates if no new save was triggered while we were writing. */
    if (gen === this.saveGeneration) {
      await clearPendingUpdates(this.documentId);
    }
  }

  // ===========================================================================
  //  Supabase Persistence Timer
  // ===========================================================================

  /**
   * Start the periodic timer that persists dirty documents to Supabase.
   */
  private startPersistTimer(): void {
    const config = getCRDTConfig();
    this.persistTimer = setInterval(() => {
      this.tryPersistToSupabase();
    }, config.persistIntervalMs);
  }

  /**
   * Attempt to persist the document to Supabase if it's dirty and online.
   *
   * @returns `true` if persist succeeded, `false` if skipped or failed.
   */
  private tryPersistToSupabase(force = false): Promise<boolean> {
    if (!force && this.destroyed) return Promise.resolve(false);
    if (!this._isOnline || !this._isDirty) return Promise.resolve(false);

    /* Check if state has actually changed since last persist. */
    const currentStateVector = Y.encodeStateVector(this.doc);
    if (
      this.lastPersistedStateVector &&
      arraysEqual(currentStateVector, this.lastPersistedStateVector)
    ) {
      debugLog(`[CRDT] Document ${this.documentId}: Supabase persist skipped (not dirty)`);
      return Promise.resolve(false);
    }

    /* Guard against concurrent persists. */
    if (this.persistInProgress) {
      debugLog(`[CRDT] Document ${this.documentId}: persist already in progress, skipping`);
      return Promise.resolve(false);
    }

    this.persistInProgress = true;
    const promise = (async (): Promise<boolean> => {
      try {
        await persistDocument(this.documentId, this.doc);
        this.lastPersistedStateVector = currentStateVector;
        this._isDirty = false;

        /* Update local record's lastPersistedAt. */
        if (this.offlineEnabled) {
          const existing = await loadDocumentState(this.documentId);
          if (existing) {
            existing.lastPersistedAt = new Date().toISOString();
            await saveDocumentState(existing);
          }
        }
        return true;
      } catch (e) {
        debugWarn(`[CRDT] Document ${this.documentId}: Supabase persist failed:`, e);
        return false;
      } finally {
        this.persistInProgress = false;
        this.persistPromise = null;
      }
    })();

    this.persistPromise = promise.then(() => {});
    return promise;
  }

  // ===========================================================================
  //  Channel Management
  // ===========================================================================

  /**
   * Join the Supabase Broadcast channel for this document.
   */
  private async joinChannel(): Promise<void> {
    this.channel = new CRDTChannel(this.documentId, this.doc, (state) => {
      this._connectionState = state;
    });
    await this.channel.join();
  }

  // ===========================================================================
  //  Reconnection
  // ===========================================================================

  /**
   * Handle offline → online transition.
   *
   * Merges pending updates, rejoins the Broadcast channel, runs sync protocol,
   * and persists the merged state to Supabase.
   */
  private async handleReconnect(): Promise<void> {
    /* Guard against concurrent reconnects. */
    if (this.reconnectInProgress) {
      debugLog(`[CRDT] Document ${this.documentId}: reconnect already in progress, skipping`);
      return;
    }
    this.reconnectInProgress = true;

    try {
      debugLog(`[CRDT] Document ${this.documentId}: reconnecting after coming online`);

      /* Merge any pending updates accumulated while offline.
       * Use 'load' origin so the update handler doesn't re-queue or re-broadcast them. */
      const pendingUpdates = await loadPendingUpdates(this.documentId);
      if (pendingUpdates.length > 0) {
        debugLog(
          `[CRDT] Document ${this.documentId}: merging ${pendingUpdates.length} pending updates after reconnect`
        );
        const merged = Y.mergeUpdates(pendingUpdates.map((p) => p.update));
        Y.applyUpdate(this.doc, merged, 'load');
      }

      /* Rejoin Broadcast channel. */
      if (this.channel) {
        await this.channel.leave();
      }
      await this.joinChannel();

      /* Run sync protocol. */
      if (this.channel) {
        const peersResponded = await this.channel.waitForSync();
        if (!peersResponded) {
          await this.fetchAndMergeRemoteState();
        }
      }

      /* Broadcast our pending updates to peers. */
      const state = Y.encodeStateAsUpdate(this.doc);
      this.channel?.broadcastUpdate(state);

      /* Immediately persist merged state to Supabase. */
      this._isDirty = true;
      const persisted = await this.tryPersistToSupabase();

      /* Only clear pending updates if persist succeeded. */
      if (persisted) {
        await clearPendingUpdates(this.documentId);
      }

      debugLog(
        `[CRDT] Document ${this.documentId}: reconnection sync complete, state size ${state.byteLength} bytes`
      );
    } finally {
      this.reconnectInProgress = false;
    }
  }

  // ===========================================================================
  //  Destruction
  // ===========================================================================

  /**
   * Destroy this provider: save final state, leave channel, clean up.
   */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    debugLog(
      `[CRDT] Closing document ${this.documentId} (dirty=${this._isDirty}, online=${this._isOnline})`
    );

    /* Stop timers. */
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.localSaveTimer) {
      clearTimeout(this.localSaveTimer);
      this.localSaveTimer = null;
    }

    /* Unwire update handler. */
    if (this.updateHandler) {
      this.doc.off('update', this.updateHandler);
      this.updateHandler = null;
    }

    /* Unsubscribe from online store. */
    if (this.onlineUnsubscribe) {
      this.onlineUnsubscribe();
      this.onlineUnsubscribe = null;
    }

    /* Save final state to IndexedDB. */
    if (this.offlineEnabled) {
      await this.saveToIndexedDB(true);
    }

    /* Await any in-flight persist before final persist attempt. */
    if (this.persistPromise) {
      await this.persistPromise;
    }

    /* Persist to Supabase if online and dirty (force=true bypasses destroyed check). */
    if (this._isOnline && this._isDirty) {
      await this.tryPersistToSupabase(true);
    }

    /* Leave presence. */
    leavePresence(this.documentId);

    /* Leave Broadcast channel. */
    if (this.channel) {
      await this.channel.leave();
      this.channel = null;
    }

    /* Destroy Y.Doc. */
    this.doc.destroy();

    /* Remove from active providers. */
    activeProviders.delete(this.documentId);
  }
}

// =============================================================================
//  Utility
// =============================================================================

/** Compare two Uint8Arrays for equality. */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// =============================================================================
//  Public Factory Functions
// =============================================================================

/**
 * Open a collaborative CRDT document.
 *
 * Creates a new `CRDTProvider` for the document, loads its initial state
 * (from IndexedDB or Supabase), wires update handlers, joins the Broadcast
 * channel, and starts the periodic persist timer.
 *
 * **Idempotent:** If the document is already open, returns the existing provider.
 *
 * @param documentId - Unique identifier for the document.
 * @param pageId - The page/entity this document belongs to.
 * @param options - Optional configuration (offline mode, initial presence).
 * @returns The active `CRDTProvider` for this document.
 *
 * @throws {Error} If CRDT is not configured in `initEngine()`.
 *
 * @example
 * const provider = await openDocument('doc-1', 'page-1', {
 *   offlineEnabled: true,
 *   initialPresence: { name: 'Alice' },
 * });
 * const text = provider.doc.getText('content');
 */
export async function openDocument(
  documentId: string,
  pageId: string,
  options: OpenDocumentOptions = {}
): Promise<CRDTProvider> {
  /* Ensure CRDT is configured (getCRDTConfig throws if not). */
  getCRDTConfig();

  /* Return existing provider if already open (idempotent). */
  const existing = activeProviders.get(documentId);
  if (existing) return existing;

  /* If init is already in-flight for this document, await the same promise. */
  const inflight = initPromises.get(documentId);
  if (inflight) return inflight;

  /* Create and initialize a new provider. */
  const provider = new CRDTProviderImpl(documentId, pageId, options.offlineEnabled ?? false);

  activeProviders.set(documentId, provider);

  const promise = (async (): Promise<CRDTProvider> => {
    try {
      await provider.init(options);
      return provider;
    } catch (e) {
      /* Clean up on initialization failure — use provider.destroy() to release all resources. */
      await provider.destroy();
      throw e;
    } finally {
      initPromises.delete(documentId);
    }
  })();

  initPromises.set(documentId, promise);
  return promise;
}

/**
 * Close a specific CRDT document.
 *
 * Saves final state, persists to Supabase if dirty, leaves the Broadcast
 * channel, and destroys the Y.Doc.
 *
 * @param documentId - The document to close.
 */
export async function closeDocument(documentId: string): Promise<void> {
  const provider = activeProviders.get(documentId);
  if (!provider) return;
  await provider.destroy();
}

/**
 * Close all active CRDT documents.
 *
 * Called during sign-out to ensure all documents are properly saved and
 * all channels are cleaned up. Each document is closed in parallel.
 */
export async function closeAllDocuments(): Promise<void> {
  const count = activeProviders.size;
  if (count === 0) return;

  const promises = Array.from(activeProviders.values()).map((p) => p.destroy());
  await Promise.allSettled(promises);

  debugLog(`[CRDT] All documents closed (count=${count})`);
}

/**
 * Get the active provider for a document, if open.
 *
 * @param documentId - The document to look up.
 * @returns The active provider, or `undefined` if not open.
 * @internal
 */
export function getActiveProvider(documentId: string): CRDTProvider | undefined {
  return activeProviders.get(documentId);
}

/**
 * Get all active provider entries for iteration.
 *
 * Used by {@link persistence.ts#persistAllDirty} to iterate and persist
 * all dirty documents. Returns `[documentId, provider]` pairs.
 *
 * @returns Iterator of `[documentId, CRDTProvider]` entries.
 * @internal
 */
export function getActiveProviderEntries(): IterableIterator<[string, CRDTProvider]> {
  return activeProviders.entries();
}
