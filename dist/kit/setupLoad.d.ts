/**
 * Factory for the /setup +page.ts load function.
 *
 * Access control: if unconfigured, allow anyone. If configured, require admin.
 */
export declare function createSetupLoad(): () => Promise<{
    isFirstSetup?: undefined;
} | {
    isFirstSetup: boolean;
}>;
//# sourceMappingURL=setupLoad.d.ts.map