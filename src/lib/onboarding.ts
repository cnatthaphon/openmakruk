// First-time onboarding state.
//
// Single flag — true once the user has dismissed the welcome flow at
// least once. We don't store partial progress through the steps; the
// flow is short enough that "show or don't show" is the only state
// we care about.
//
// Why a flag (not a counter): once a user has gone through onboarding,
// re-showing it would be annoying. They can always change settings
// later in the Profile / Settings tabs. The flag is wiped if the user
// clicks "reset profile" in Settings.

import { defineFlag } from './stores';

const FLAG = defineFlag('openmakruk_onboarded');

export function hasOnboarded(): boolean {
  return FLAG.read();
}

export function markOnboarded(): void {
  FLAG.set(true);
}

export function resetOnboarding(): void {
  FLAG.clear();
}
