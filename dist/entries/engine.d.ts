/**
 * @fileoverview Engine lifecycle subpath barrel — `stellar-drive/engine`
 *
 * Re-exports engine lifecycle functions: starting/stopping the sync engine,
 * triggering manual sync cycles, and repairing the sync queue.
 */
export { startSyncEngine, runFullSync, repairSyncQueue } from '../engine';
export { onSyncComplete } from '../engine';
export { clearPendingSyncQueue } from '../engine';
//# sourceMappingURL=engine.d.ts.map