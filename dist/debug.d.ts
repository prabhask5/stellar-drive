export declare function _setDebugPrefix(prefix: string): void;
export declare function isDebugMode(): boolean;
export declare function setDebugMode(enabled: boolean): void;
export declare function debugLog(...args: unknown[]): void;
export declare function debugWarn(...args: unknown[]): void;
export declare function debugError(...args: unknown[]): void;
/**
 * Unified debug function. Replaces debugLog/debugWarn/debugError with a single export.
 */
export declare function debug(level: 'log' | 'warn' | 'error', ...args: unknown[]): void;
//# sourceMappingURL=debug.d.ts.map