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

// Schema v2 — added province + region (Phase 9H-1). v1 stores migrate
// with both fields null; the server is the source of truth so they
// fill in on the next /me sync.
const SESSION_VERSION = 2;

type CloudSessionStore = {
  /** Bearer token returned by /api/users/anon. Empty string means
   *  "not signed in". */
  token: string;
  /** User id — copied from the registration response so we can show
   *  "you are <name>" before any /me roundtrip. */
  userId: string;
  /** Display name as last seen from the server. */
  displayName: string;
  /** ISO-3166-2:TH suffix (e.g. "10" for Bangkok). null = opted out. */
  province: string | null;
  /** Region rollup, denormalized for cheap UI without a province
   *  lookup. Computed by the server from province; client trusts it. */
  region: string | null;
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
    province: null,
    region: null,
    lastSyncAt: 0,
  }),
  migrate: (raw) => {
    const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<CloudSessionStore>;
    return {
      token: typeof obj.token === 'string' ? obj.token : '',
      userId: typeof obj.userId === 'string' ? obj.userId : '',
      displayName: typeof obj.displayName === 'string' ? obj.displayName : '',
      province: typeof obj.province === 'string' ? obj.province : null,
      region: typeof obj.region === 'string' ? obj.region : null,
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
export async function enableCloud(
  opts: { displayName?: string; province?: string | null } = {},
): Promise<CloudSessionStore> {
  let session = loadSession();

  if (!session.token) {
    // First-time enable — register a new anonymous user.
    const user = await cloudflareBackend.registerAnon(opts);
    session = {
      token: user.token,
      userId: user.id,
      displayName: user.displayName,
      province: user.province,
      region: user.region,
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
        const user = await cloudflareBackend.registerAnon({
          displayName: session.displayName,
          province: session.province,
        });
        session = {
          token: user.token,
          userId: user.id,
          displayName: user.displayName,
          province: user.province,
          region: user.region,
          lastSyncAt: Date.now(),
        };
        saveSession(session);
      } else {
        // Update cached profile fields opportunistically.
        session = {
          ...session,
          displayName: profile.displayName,
          province: profile.province,
          region: profile.region,
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

  // Trigger an immediate badge evaluation so the welcome badge (and
  // any badges the user already qualified for via local play before
  // enabling sync) light up without waiting for the next recorded
  // game. Fire-and-forget — failure is silent because the user will
  // re-evaluate on their first game anyway.
  cloudflareBackend
    .evaluateMyBadges(session.token)
    .catch(() => undefined);

  return session;
}

/** Cheap synchronous check: did the user previously enable cloud sync?
 *  Used by App.tsx on boot so we can auto-restore the session without
 *  blocking the first render on a network roundtrip. */
export function hasStoredSession(): boolean {
  return loadSession().token.length > 0;
}

/** Sign in with an existing token (recovery flow). Validates against
 *  the server; if it accepts, replaces the local session entirely. If
 *  the server rejects, the previous session is left untouched and the
 *  caller learns via a thrown error. */
export async function signInWithToken(token: string): Promise<CloudSessionStore> {
  const trimmed = token.trim();
  if (trimmed.length < 32) {
    throw new Error('Token สั้นเกินไป · กรุณาตรวจสอบและลองอีกครั้ง');
  }
  const profile = await cloudflareBackend.getProfile(trimmed);
  if (!profile) {
    throw new Error('Token ไม่ถูกต้องหรือถูกยกเลิกแล้ว');
  }
  const session: CloudSessionStore = {
    token: trimmed,
    userId: profile.id,
    displayName: profile.displayName,
    province: profile.province,
    region: profile.region,
    lastSyncAt: Date.now(),
  };
  saveSession(session);
  cloudflareBackend.setToken(trimmed);
  setBackend(cloudflareBackend);
  return session;
}

/** "Sign out everywhere" — rotates the server-side token and replaces
 *  the local copy. Other devices instantly start receiving 401. */
export async function rotateCurrentToken(): Promise<CloudSessionStore> {
  const session = loadSession();
  if (!session.token) throw new Error('ยังไม่ได้ login · ไม่มีอะไรให้ rotate');
  if (!cloudflareBackend.rotateToken) {
    throw new Error('Backend ปัจจุบันไม่รองรับ token rotation');
  }
  const { token: newToken } = await cloudflareBackend.rotateToken(session.token);
  const next: CloudSessionStore = { ...session, token: newToken, lastSyncAt: Date.now() };
  saveSession(next);
  cloudflareBackend.setToken(newToken);
  return next;
}

/** Permanent account deletion — wipes server-side + clears the local
 *  session. The previous account id can never be re-attached after this. */
export async function deleteCurrentAccount(): Promise<void> {
  const session = loadSession();
  if (!session.token) {
    // No session to delete — just nuke local for parity.
    store.clear();
    return;
  }
  if (!cloudflareBackend.deleteAccount) {
    throw new Error('Backend ปัจจุบันไม่รองรับการลบบัญชี');
  }
  await cloudflareBackend.deleteAccount(session.token);
  store.clear();
  cloudflareBackend.setToken(null);
  setBackend(NoOpBackend);
}

/**
 * Fetch server-side game history and merge into the local UserStats.
 * Called after the cloud session activates so multi-device users see
 * yesterday's games on tomorrow's browser.
 *
 * Merge strategy: union by `id`, with server entries authoritative
 * for fields like rating_after / verified. New-to-this-device games
 * are appended; locally-known games keep their existing position
 * (newest-first) but adopt the server's rating numbers.
 *
 * Tombstone reconciliation (issue #21 follow-up): the caller hands in
 * the local `deletedIds` list. Any server row whose id appears in
 * that list is EXCLUDED from the merge AND we fire a fresh DELETE
 * for it. When the DELETE succeeds (200 with `deleted: true` OR
 * `deleted: false` meaning the server has already removed it), the
 * id is dropped from the returned `deletedIds`. Failures leave the
 * tombstone in place so the next sync retries — that's what makes
 * the local delete durable across a flaky network.
 */
export async function syncHistoryFromServer(
  localHistory: import('../stats').GameRecord[],
  localDeletedIds: string[] = [],
): Promise<{
  history: import('../stats').GameRecord[];
  deletedIds: string[];
}> {
  const backend = cloudflareBackend;
  if (!backend.isOnline()) {
    return { history: localHistory, deletedIds: localDeletedIds };
  }
  const session = loadSession();
  if (!session.token) {
    return { history: localHistory, deletedIds: localDeletedIds };
  }

  const tombstones = new Set(localDeletedIds);

  // Retry pending deletes. Run in parallel — they're idempotent on the
  // server (issue #21 DELETE /api/games/:id returns ok:true regardless
  // of whether the row was there to begin with). On success, drop the
  // tombstone. On failure, keep it for the next sync.
  if (tombstones.size > 0 && backend.deleteGame) {
    const stillTombstoned = new Set<string>();
    await Promise.all(
      Array.from(tombstones).map(async (id) => {
        try {
          await backend.deleteGame!(session.token, id);
          // Either branch (deleted=true / false) means the row is now
          // absent from the server — both are wins.
        } catch {
          // Network or 5xx — keep the tombstone for next time.
          stillTombstoned.add(id);
        }
      }),
    );
    // Replace `tombstones` with the still-pending set so the filter
    // below uses the same source of truth as the returned ids.
    tombstones.clear();
    for (const id of stillTombstoned) tombstones.add(id);
  }

  try {
    const { games } = await backend.fetchGameHistory(session.token, { limit: 50 });
    const byId = new Map<string, import('../stats').GameRecord>();
    for (const g of localHistory) byId.set(g.id, g);
    for (const s of games) {
      // Server rows the user already deleted locally must NOT come
      // back through sync. If the delete-retry above failed, the
      // tombstone is still in `tombstones` and we skip the row.
      if (tombstones.has(s.id)) continue;
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
    const history = Array.from(byId.values())
      .sort((a, b) => b.date - a.date)
      .slice(0, 50);
    return { history, deletedIds: Array.from(tombstones) };
  } catch {
    // Network blip — leave local history alone but keep the pending
    // tombstones so they retry on the next sync.
    return { history: localHistory, deletedIds: Array.from(tombstones) };
  }
}
