import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * Back to the existing home screen instead of stacking a second one. Replacing the player with a new home instance
 * left a stale home underneath (owner report 2026-10-01: logo missing after leaving a tour).
 */
export function goHome(router: Router) {
  if (router.canDismiss()) router.dismissTo('/home');
  else router.replace('/home');
}

let ending = false;
/** True while a tour is being ended from the player (it must not redirect home on its own meanwhile). */
export const isEndingTour = () => ending;

/** Ends the tour, then shows its summary when it was worth one, otherwise home. */
export async function endTourAndShowSummary(router: Router, end: () => Promise<string | undefined>) {
  ending = true;
  try {
    const recordId = await end();
    if (recordId) router.replace({ pathname: '/summary/[id]', params: { id: recordId } });
    else goHome(router);
  } finally {
    // the player unmounts with the navigation; release the flag after this frame
    setTimeout(() => (ending = false), 500);
  }
}
