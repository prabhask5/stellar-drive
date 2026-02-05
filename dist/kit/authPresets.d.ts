/**
 * Default auth configuration presets shared across apps.
 */
export declare const defaultSingleUserAuthConfig: {
    mode: "single-user";
    singleUser: {
        gateType: "code";
        codeLength: 6;
    };
    emailConfirmation: {
        enabled: boolean;
    };
    deviceVerification: {
        enabled: boolean;
        trustDurationDays: number;
    };
    confirmRedirectPath: string;
    profileExtractor: (meta: Record<string, unknown>) => {
        firstName: string;
        lastName: string;
    };
    profileToMetadata: (p: Record<string, unknown>) => {
        first_name: unknown;
        last_name: unknown;
    };
    enableOfflineAuth: boolean;
};
//# sourceMappingURL=authPresets.d.ts.map