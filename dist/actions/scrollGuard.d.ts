/**
 * Svelte action that prevents accidental click/tap events during scroll.
 *
 * On mobile, a touch interaction that starts as a tap but becomes a scroll
 * can still fire a synthetic click event. This action detects when the finger
 * moves beyond a threshold during a touch and suppresses the resulting click.
 *
 * Usage: `<main use:scrollGuard>` on any scrollable container (typically the
 * root layout's `<main>` element so all pages are protected).
 */
export declare function scrollGuard(node: HTMLElement): {
    destroy(): void;
};
//# sourceMappingURL=scrollGuard.d.ts.map