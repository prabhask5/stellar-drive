/**
 * CRDT Document Lifecycle Management
 *
 * Creates, manages, and destroys Yjs Y.Doc instances with y-indexeddb persistence.
 * The engine fully owns all Yjs and y-indexeddb -- apps never import these directly.
 */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { CrdtDocConfig, CrdtDocState } from './types';
/**
 * Initialize a CRDT document with local IndexedDB persistence.
 *
 * Creates a Y.Doc and attaches IndexeddbPersistence for local durability.
 * If the document already exists, returns the existing instance.
 *
 * @param docId - Unique identifier for the document (typically note ID)
 * @param config - Optional configuration
 * @returns The Y.Doc instance
 */
export declare function initCrdtDoc(docId: string, config?: CrdtDocConfig): Y.Doc;
/**
 * Get an active CRDT document by ID.
 *
 * @param docId - Document identifier
 * @returns The Y.Doc if it exists, undefined otherwise
 */
export declare function getCrdtDoc(docId: string): Y.Doc | undefined;
/**
 * Wait for a document's IndexedDB persistence to finish syncing.
 * Resolves immediately if already synced.
 *
 * @param docId - Document identifier
 */
export declare function waitForCrdtSync(docId: string): Promise<void>;
/**
 * Destroy a CRDT document and clean up all resources.
 *
 * Closes IndexedDB persistence, runs cleanup callbacks, and removes from active map.
 *
 * @param docId - Document identifier
 */
export declare function destroyCrdtDoc(docId: string): Promise<void>;
/**
 * Get the internal state for a document (used by other CRDT modules).
 * @internal
 */
export declare function _getDocEntry(docId: string): {
    doc: Y.Doc;
    persistence: IndexeddbPersistence;
    state: CrdtDocState;
} | undefined;
/**
 * Get all active document IDs.
 */
export declare function getActiveCrdtDocIds(): string[];
//# sourceMappingURL=doc.d.ts.map