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

const MOVE_THRESHOLD = 10; // px — movement beyond this means scroll, not tap

export function scrollGuard(node: HTMLElement) {
  let startX = 0;
  let startY = 0;
  let didScroll = false;

  // Track the pending suppressor so we can clear it if a new touch starts
  let pendingHandler: ((e: Event) => void) | null = null;
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearPendingSuppressor() {
    if (pendingHandler) {
      node.removeEventListener('click', pendingHandler, true);
      pendingHandler = null;
    }
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
  }

  function onTouchStart(e: TouchEvent) {
    // A new touch means the user is starting a fresh gesture —
    // clear any leftover suppressor from a previous scroll so it
    // doesn't eat a legitimate tap.
    clearPendingSuppressor();

    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    didScroll = false;
  }

  function onTouchMove(e: TouchEvent) {
    if (didScroll) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      didScroll = true;
    }
  }

  function onTouchEnd() {
    if (!didScroll) return;
    // Suppress the synthetic click that browsers fire after touchend
    const handler = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      clearPendingSuppressor();
    };
    pendingHandler = handler;
    node.addEventListener('click', handler, true);
    // Safety: remove if click never fires (e.g. iOS edge cases)
    pendingTimeout = setTimeout(() => clearPendingSuppressor(), 400);
  }

  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: true });
  node.addEventListener('touchend', onTouchEnd, { passive: true });

  return {
    destroy() {
      clearPendingSuppressor();
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
    }
  };
}
