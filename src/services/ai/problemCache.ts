/**
 * Instant-serve cache for verified, AI-authored problems.
 *
 * "Cheap & instant" plan: AI generation is slow and costs money, so once we have
 * produced a verified problem for a `(conceptId, levelBucket, seed)` key we
 * store it in a Firestore `problems` collection and serve it instantly on the
 * next request for that key. Generation only runs on a cache MISS; the practice
 * surface also prefetches the next problem while the learner answers.
 *
 * Everything here:
 * - is gated behind a configured + signed-in Firebase (reads/writes require auth
 *   per `firestore.rules`); it no-ops otherwise so guests fall straight through
 *   to the deterministic generator,
 * - lazily imports Firebase so this module (and its consumers' tests) load even
 *   when Firebase is not configured,
 * - NEVER throws: any failure resolves to `null` / a no-op so the UI never hangs.
 */

import type { GeneratedProblem } from './types';

/** Firestore collection holding cached, verified problems. */
const COLLECTION = 'problems';

/**
 * Stable cache key for a problem request. We bucket by exact numeric level so a
 * given level always reuses the same generated scenarios across learners.
 */
export function cacheKey(conceptId: string, level: number, seed: number): string {
  const safeLevel = Math.max(1, Math.round(level));
  return `${conceptId}_L${safeLevel}_${seed}`;
}

/** Resolve the Firestore handle, or null when Firebase is off / signed out. */
async function getDbIfAuthed(): Promise<{ db: unknown } | null> {
  try {
    const { db, firebaseEnabled, auth } = await import('../../firebase');
    if (!firebaseEnabled || !db) return null;
    // Reads + writes both require an authenticated user under our rules.
    if (!auth?.currentUser) return null;
    return { db };
  } catch {
    return null;
  }
}

/** Minimal shape guard so a malformed cache doc can never poison grading. */
function looksLikeProblem(value: unknown): value is GeneratedProblem {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<GeneratedProblem>;
  return (
    typeof p.id === 'string' &&
    typeof p.conceptId === 'string' &&
    typeof p.difficulty === 'string' &&
    typeof p.prompt === 'string' &&
    typeof p.acceptedAnswer === 'string' &&
    typeof p.acceptedDecimal === 'number' &&
    typeof p.tolerance === 'number' &&
    typeof p.params === 'object' &&
    p.params !== null &&
    typeof p.solution === 'object' &&
    p.solution !== null &&
    typeof p.solution.fraction === 'string' &&
    typeof p.solution.decimal === 'number' &&
    Array.isArray(p.solution.steps)
  );
}

/**
 * Read a cached problem by key. Returns the problem on a hit, or `null` on miss,
 * when Firebase is off/signed-out, or on any error.
 */
export async function readCachedProblem(key: string): Promise<GeneratedProblem | null> {
  const ctx = await getDbIfAuthed();
  if (!ctx) return null;
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap = await getDoc(doc(ctx.db as any, COLLECTION, key));
    if (!snap.exists()) return null;
    const data = snap.data();
    return looksLikeProblem(data) ? (data as GeneratedProblem) : null;
  } catch {
    return null;
  }
}

/**
 * Write a verified problem to the cache. Best-effort and silent: a failed write
 * (offline, rules, quota) just means the next request regenerates. No-ops when
 * Firebase is off / signed out.
 */
export async function writeCachedProblem(key: string, problem: GeneratedProblem): Promise<void> {
  const ctx = await getDbIfAuthed();
  if (!ctx) return;
  try {
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await setDoc(doc(ctx.db as any, COLLECTION, key), {
      ...problem,
      cachedAt: serverTimestamp(),
    });
  } catch {
    /* best-effort: ignore */
  }
}
