// CRDT subpath barrel – @prabhask5/stellar-engine/crdt
export {
  // Yjs re-exports
  YDoc,
  YArray,
  YMap,
  YText,
  Y,

  // Document lifecycle
  initCrdtDoc,
  getCrdtDoc,
  destroyCrdtDoc,
  waitForCrdtSync,
  getActiveCrdtDocIds,

  // Realtime sync
  connectCrdtRealtime,
  disconnectCrdtRealtime,
  saveCrdtCheckpoint,
  loadCrdtFromRemote,
  getCrdtSyncState,
  isCrdtRealtimeConnected,

  // Awareness (presence)
  initAwareness,
  getAwareness,
  destroyAwareness,
  Awareness,

  // Offline cache
  cacheCrdtForOffline,
  removeCrdtOfflineCache,
  isCrdtCachedOffline,
  loadCrdtFromOfflineCache
} from '../crdt/index';

export type {
  CrdtDocConfig,
  AwarenessUser,
  CrdtSyncState,
  CrdtBroadcastPayload
} from '../crdt/types';
