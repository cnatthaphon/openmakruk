// Cloud-session management — owns the bearer token + the activation
// state of the Cloudflare adapter.
//
// Lifecycle:
//   1. User flips the "Cloud sync" toggle in Settings → enableCloud()
//   2. enableCloud() loads any stored token; if missing, registers a
//      fresh anonymous account on the server and persists the new
//      token. Either way, the CloudflareBackend instance is configured
//      with that token and registered as the active backend.
//   3. User flips toggle off → disableCloud() falls back to NoOp and
//      forgets the token (so a re-enable starts a fresh account; this
//      is the safer default — explicit "sign back in with token X"
//      can be added later).
//
// The token is persisted via defineStore so a future schema change
// (e.g. token rotation policy) gets the same migration treatment as
// every other store.

import { defineStore } from '../stores';
import { setBackend } from './index';
import { cloudflareBackend, BackendError } from './cloudflareBackend';
import { NoOpBackend } from './types';

const SESSION_VERSION = 1;

type CloudSessionStore = {
  /** Bearer token returned by /api/users/anon. Empty string means
   *  "not signed in". */
  token: string;
  /** User id — copied from the registration response so we can show
   *  "you are <name>" before any /me roundtrip. */
  userId: string;
  /** Display name as last seen from the server. */
  displayName: string;
  /** Unix ms — last successful /me call. Used by Settings to show
   *  "synced N minutes ago". */
  lastSyncAt: number;
};

const store = defineStore<CloudSessionStore>({
  key: 'openmakruk_cloud_session',
  version: SESSION_VERSION,
  default: () => ({
    token: '',
    userId: '',
    displayName: '',
    lastSyncAt: 0,
  }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<CloudSessionStore>;
    return {
      token: typeof obj.token === 'string' ? obj.token : '',
      userId: typeof obj.userId === 'string' ? obj.userId : '',
      displayName: typeof obj.displayName === 'string' ? obj.displayName : '',
      lastSyncAt: typeof obj.lastSyncAt === 'number' ? obj.lastSyncAt : 0,
    };
  },
});

export function loadSession(): CloudSessionStore {
  return store.load();
}

export function saveSession(s: CloudSessionStore): void {
  store.save(s);
}

/** Clear the session (sign-out) and revert to NoOp backend. */
export function disableCloud(): void {
  store.clear();
  cloudflareBackend.setToken(null);
  setBackend(NoOpBackend);
}

/** Enable cloud sync:
 *  - If we already have a token, re-attach to the existing account.
 *  - Else, register a fresh anonymous user and persist the token.
 *  - In both cases, set Cloudflare adapter as the active backend.
 *
 *  Returns the synced profile (or throws if registration fails — UI
 *  should toast and offer retry). */
export async function enableCloud(displayName?: string): Promise<CloudSessionStore> {
  let session = loadSession();

  if (!session.token) {
    // First-time enable — register a new anonymous user.
    const user = await cloudflareBackend.registerAnon(displayName);
    session = {
      token: user.token,
      userId: user.id,
      displayName: user.displayName,
      lastSyncAt: Date.now(),
    };
    saveSession(session);
  } else {
    // Returning user — verify the token is still valid. If the server
    // doesn't recognise it (admin wipe, db rebuild), treat that as a
    // forced sign-out so the user isn't stuck with a phantom session.
    try {
      const profile = await cloudflareBackend.getProfile(session.token);
      if (!profile) {
        // Token rejected. Clear and re-register.
        store.clear();
        const user = await cloudflareBackend.registerAnon(session.displayName);
        session = {
          token: user.token,
          userId: user.id,
          displayName: user.displayName,
          lastSyncAt: Date.now(),
        };
        saveSession(session);
      } else {
        // Update cached profile fields opportunistically.
        session = {
          ...session,
          displayName: profile.displayName,
          lastSyncAt: Date.now(),
        };
        saveSession(session);
      }
    } catch (err) {
      // Network failure — keep the local session but don't activate
      // the backend (isOnline() will return false until we have a
      // working profile).
      if (err instanceof BackendError) {
        throw err;
      }
      throw err;
    }
  }

  cloudflareBackend.setToken(session.token);
  setBackend(cloudflareBackend);
  return session;
}

/** Cheap synchronous check: did the user previously enable cloud sync?
 *  Used by App.tsx on boot so we can auto-restore the session without
 *  blocking the first render on a network roundtrip. */
export function hasStoredSession(): boolean {
  return loadSession().token.length > 0;
}

/** Fetch server-side game history and merge into the local UserStats.
 *  Called after the cloud session activates so multi-device users see
 *  yesterday's games on tomorrow's browser.
 *
 *  Merge strategy: union by `id`, with server entries authoritative
 *  for fields like rating_after / verified. New-to-this-device games
 *  are appended; locally-known games keep their existing position
 *  (newest-first) but adopt the server's rating numbers. */
export async function syncHistoryFromServer(
  localHistory: import('../stats').GameRecord[],
): Promise<import('../stats').GameRecord[]> {
  const backend = cloudflareBackend;
  if (!backend.isOnline()) return localHistory;
  const session = loadSession();
  if (!session.token) return localHistory;

  try {
    const { games } = await backend.fetchGameHistory(session.token, { limit: 50 });
    const byId = new Map<string, import('../stats').GameRecord>();
    for (const g of localHistory) byId.set(g.id, g);
    for (const s of games) {
      // Translate server shape → local GameRecord shape.
      const local: import('../stats').GameRecord = {
        id: s.id,
        outcome: s.outcome as 'win' | 'loss' | 'draw',
        opponent: s.opponent as import('../engine').Difficulty,
        userSide: s.userSide,
        date: s.createdAt,
        plyCount: s.plyCount,
        ratingBefore: s.ratingBefore,
        ratingAfter: s.ratingAfter,
        ratingDelta: s.ratingDelta,
        moves: s.moves ?? [],
        mode: s.mode as 'rated' | 'casual' | undefined,
        timeControlId: s.timeControlId ?? undefined,
        finalFen: s.finalFen,
      };
      byId.set(s.id, local);
    }
    // Sort newest-first to match the local history convention.
    return Array.from(byId.values()).sort((a, b) => b.date - a.date).slice(0, 50);
  } catch {
    // Network blip — leave local history alone.
    return localHistory;
  }
}
