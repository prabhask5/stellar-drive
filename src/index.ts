// Config
export { initEngine, getEngineConfig } from './config';
export type { SyncEngineConfig, TableConfig } from './config';

// Database
export { getDb } from './database';
export type { DatabaseConfig, DatabaseVersionConfig } from './database';

// Engine lifecycle
export { startSyncEngine, stopSyncEngine } from './engine';
export { scheduleSyncPush, runFullSync, forceFullSync, resetSyncCursor } from './engine';
export { hydrateFromRemote, reconcileLocalWithRemote, performSync } from './engine';
export { clearLocalCache, clearPendingSyncQueue } from './engine';

// Entity modification tracking
export { markEntityModified, onSyncComplete } from './engine';

// Generic CRUD operations
export { engineCreate, engineUpdate, engineDelete, engineBatchWrite } from './data';
export type { BatchOperation } from './data';

// Generic query operations
export { engineGet, engineGetAll, engineQuery, engineQueryRange, engineGetOrCreate } from './data';

// Auth
export { markOffline, markAuthValidated, needsAuthValidation } from './engine';
export { signIn, signUp, signOut, getSession, isSessionExpired, changePassword, resendConfirmationEmail, getUserProfile, updateProfile, verifyOtp, getValidSession } from './supabase/auth';
export type { AuthResponse } from './supabase/auth';

// Auth lifecycle
export { resolveAuthState } from './auth/resolveAuthState';
export type { AuthStateResult } from './auth/resolveAuthState';

// Admin
export { isAdmin } from './auth/admin';

// Offline login
export { signInOffline, getOfflineLoginInfo } from './auth/offlineLogin';

// Offline credentials (kept for backward compat during transition)
export { cacheOfflineCredentials, getOfflineCredentials, verifyOfflineCredentials, clearOfflineCredentials, updateOfflineCredentialsPassword, updateOfflineCredentialsProfile } from './auth/offlineCredentials';
export { createOfflineSession, getOfflineSession, getValidOfflineSession, hasValidOfflineSession, clearOfflineSession, getOfflineSessionInfo } from './auth/offlineSession';

// Queue operations (for app repositories to call - kept for backward compat)
export { queueSyncOperation, queueIncrementOperation, queueSetOperation, queueMultiFieldSetOperation, queueCreateOperation, queueDeleteOperation } from './queue';
export { coalescePendingOps, getPendingSync, getPendingEntityIds } from './queue';

// Conflict resolution
export { resolveConflicts, getConflictHistory } from './conflicts';

// Realtime
export { startRealtimeSubscriptions, stopRealtimeSubscriptions, isRealtimeHealthy, getConnectionState, wasRecentlyProcessedByRealtime, onRealtimeDataUpdate } from './realtime';
export type { RealtimeConnectionState } from './realtime';

// Stores
export { syncStatusStore } from './stores/sync';
export type { SyncError, RealtimeState } from './stores/sync';
export { remoteChangesStore, createRecentChangeIndicator, createPendingDeleteIndicator } from './stores/remoteChanges';
export type { RemoteActionType } from './stores/remoteChanges';
export { isOnline } from './stores/network';
export { authState, isAuthenticated, userDisplayInfo } from './stores/authState';

// Supabase client
export { supabase, getSupabaseAsync, resetSupabaseClient } from './supabase/client';

// Runtime config
export { initConfig, getConfig, waitForConfig, isConfigured, setConfig, clearConfigCache } from './runtime/runtimeConfig';
export type { AppConfig } from './runtime/runtimeConfig';

// Device ID
export { getDeviceId } from './deviceId';

// Debug
export { debugLog, debugWarn, debugError, debug, isDebugMode, setDebugMode } from './debug';

// Reconnect handler (kept for backward compat)
export { setReconnectHandler, callReconnectHandler } from './reconnectHandler';

// Utilities
export { generateId, now, calculateNewOrder } from './utils';

// Svelte actions
export { remoteChangeAnimation, trackEditing, triggerLocalAnimation } from './actions/remoteChange';

// Types
export type { SyncOperationItem, OperationType, OfflineCredentials, OfflineSession, ConflictHistoryEntry, SyncStatus, AuthMode } from './types';
export { isOperationItem } from './types';
