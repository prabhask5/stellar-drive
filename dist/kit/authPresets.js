/**
 * Default auth configuration presets shared across apps.
 */
export const defaultSingleUserAuthConfig = {
    mode: 'single-user',
    singleUser: {
        gateType: 'code',
        codeLength: 6
    },
    emailConfirmation: { enabled: true },
    deviceVerification: { enabled: true, trustDurationDays: 90 },
    confirmRedirectPath: '/confirm',
    profileExtractor: (meta) => ({
        firstName: meta.first_name || '',
        lastName: meta.last_name || ''
    }),
    profileToMetadata: (p) => ({
        first_name: p.firstName,
        last_name: p.lastName
    }),
    enableOfflineAuth: true
};
//# sourceMappingURL=authPresets.js.map