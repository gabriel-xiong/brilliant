import { describe, expect, it } from 'vitest';
import {
  MAX_LEVEL,
  MIN_LEVEL,
  bandToLevel,
  buildPracticeSessionSlots,
  conceptReviewState,
  conceptPracticeSignal,
  difficultyForStatus,
  dueReviewConcepts,
  levelForConcept,
  levelToBand,
  nextLevel,
  normalizePracticeConceptSelection,
  orderPracticeConceptsForSession,
  parseConceptIds,
  recommendedReviewConcepts,
} from './practiceService';
import type { UserSummary } from './progressService';

const baseSummary: UserSummary = {
  lastActiveDate: '2026-06-27',
  currentStreak: 0,
  longestStreak: 0,
  masterySummary: {},
  practiceStats: {},
};

describe('nextLevel — adaptive stepper', () => {
  it('steps up by one on a streak of exactly 2', () => {
    expect(nextLevel(3, true, 2)).toBe(4);
  });

  it('holds level on a correct answer with no streak yet', () => {
    expect(nextLevel(3, true, 1)).toBe(3);
  });

  it('jumps faster on longer streaks (4+ -> +2, 6+ -> +3)', () => {
    expect(nextLevel(3, true, 4)).toBe(5);
    expect(nextLevel(3, true, 6)).toBe(6);
  });

  it('steps down by one on a miss', () => {
    expect(nextLevel(5, false, 0)).toBe(4);
  });

  it('is floored at MIN_LEVEL and never goes below it', () => {
    expect(nextLevel(1, false, 0)).toBe(MIN_LEVEL);
    expect(nextLevel(MIN_LEVEL, false, 3)).toBe(MIN_LEVEL);
  });

  it('is capped at MAX_LEVEL and never climbs above it', () => {
    expect(nextLevel(MAX_LEVEL, true, 2)).toBe(MAX_LEVEL);
    expect(nextLevel(9, true, 2)).toBe(MAX_LEVEL);
    expect(nextLevel(9, true, 6)).toBe(MAX_LEVEL);
    expect(nextLevel(MAX_LEVEL + 5, true, 6)).toBe(MAX_LEVEL);
  });

  it('rounds non-integer input before stepping', () => {
    expect(nextLevel(4.4, true, 2)).toBe(5);
  });
});

describe('levelToBand — display band for a numeric level', () => {
  it('maps low levels to warm-up/core/challenge', () => {
    expect(levelToBand(1)).toBe('intro');
    expect(levelToBand(2)).toBe('intro');
    expect(levelToBand(3)).toBe('core');
    expect(levelToBand(5)).toBe('core');
    expect(levelToBand(6)).toBe('challenge');
    expect(levelToBand(8)).toBe('challenge');
  });

  it('uses advanced/expert for the top of the range', () => {
    expect(levelToBand(9)).toBe('advanced');
    expect(levelToBand(MAX_LEVEL)).toBe('expert');
  });
});

describe('band <-> level seeding', () => {
  it('maps mastery bands to starting levels (intro 1, core 4, challenge 8)', () => {
    expect(bandToLevel('intro')).toBe(1);
    expect(bandToLevel('core')).toBe(4);
    expect(bandToLevel('challenge')).toBe(8);
  });

  it('starts proficient lessons in core practice, below mastered challenge work', () => {
    expect(difficultyForStatus('completed')).toBe('core');
    expect(difficultyForStatus('proficient')).toBe('core');
    expect(difficultyForStatus('mastered')).toBe('challenge');
  });

  it('seeds a signed-out / empty learner at the lowest level', () => {
    expect(levelForConcept('single-event', null)).toBe(1);
    expect(levelForConcept('bayes', undefined)).toBe(1);
  });
});

describe('conceptPracticeSignal — Phase 3 review/readiness signal', () => {
  const now = new Date('2026-06-27T12:00:00.000Z');

  it('marks an unpracticed completed concept due for first review', () => {
    const signal = conceptPracticeSignal('single-event', null, now, 'completed');

    expect(signal.label).toBe('Proficient');
    expect(signal.dueForReview).toBe(true);
    expect(signal.dueReason).toBe('Ready for first review');
  });

  it('brings recently missed concepts back immediately', () => {
    const signal = conceptPracticeSignal(
      'single-event',
      {
        lastActiveDate: '2026-06-27',
        currentStreak: 1,
        longestStreak: 1,
        masterySummary: {},
        practiceStats: {
          'single-event': {
            answered: 5,
            correct: 3,
            bestLevel: 4,
            lastLevel: 4,
            lastPracticed: '2026-06-27T11:00:00.000Z',
          },
        },
      },
      now,
      'completed',
    );

    expect(signal.dueForReview).toBe(true);
    expect(signal.dueReason).toBe('Review after recent misses');
    expect(signal.accuracy).toBeCloseTo(0.6);
  });

  it('spaces accurate practice into the future', () => {
    const signal = conceptPracticeSignal(
      'single-event',
      {
        lastActiveDate: '2026-06-27',
        currentStreak: 1,
        longestStreak: 1,
        masterySummary: {},
        practiceStats: {
          'single-event': {
            answered: 12,
            correct: 11,
            bestLevel: 8,
            lastLevel: 8,
            lastPracticed: '2026-06-27T11:00:00.000Z',
            recentMisses: 0,
            successStreak: 3,
          },
        },
      },
      now,
      'completed',
    );

    expect(signal.label).toBe('Mastered');
    expect(signal.dueForReview).toBe(false);
    expect(signal.nextReviewAt).toBe('2026-06-30T11:00:00.000Z');
  });
});

describe('multi-topic practice selection', () => {
  it('parses valid concept ids while dropping invalid values and duplicates', () => {
    expect(parseConceptIds(['single-event', 'not-a-concept', 'complement', 'single-event', 4])).toEqual([
      'single-event',
      'complement',
    ]);
  });

  it('parses comma-separated concept ids from a review link', () => {
    expect(parseConceptIds('single-event,not-a-concept,complement,single-event')).toEqual([
      'single-event',
      'complement',
    ]);
  });

  it('keeps only unlocked requested concepts', () => {
    expect(
      normalizePracticeConceptSelection(
        ['single-event', 'bayes', 'complement'],
        ['single-event', 'complement'],
        'single-event',
      ),
    ).toEqual(['single-event', 'complement']);
  });

  it('falls back to the route/default concept when nothing requested is usable', () => {
    expect(normalizePracticeConceptSelection(['bayes'], ['single-event', 'complement'], 'complement')).toEqual([
      'complement',
    ]);
  });

  it('falls back to the first unlocked concept if the default is locked', () => {
    expect(normalizePracticeConceptSelection([], ['single-event', 'complement'], 'bayes')).toEqual(['single-event']);
  });
});

describe('spaced review state', () => {
  it('pulls recently missed concepts due sooner than successful concepts', () => {
    const now = new Date('2026-06-27T12:00:00.000Z');
    const summary: UserSummary = {
      ...baseSummary,
      practiceStats: {
        'single-event': {
          answered: 4,
          correct: 3,
          bestLevel: 4,
          lastLevel: 4,
          lastPracticed: '2026-06-27T05:00:00.000Z',
          lastReviewed: '2026-06-27T05:00:00.000Z',
          recentMisses: 1,
          successStreak: 0,
        },
        complement: {
          answered: 6,
          correct: 6,
          bestLevel: 5,
          lastLevel: 5,
          lastPracticed: '2026-06-27T05:00:00.000Z',
          lastReviewed: '2026-06-27T05:00:00.000Z',
          recentMisses: 0,
          successStreak: 4,
        },
      },
    };

    const missed = conceptReviewState('single-event', summary, now);
    const successful = conceptReviewState('complement', summary, now);

    expect(Date.parse(missed.nextDueAt)).toBeLessThan(Date.parse(successful.nextDueAt));
    expect(missed.reason).toBe('missed-recently');
    expect(dueReviewConcepts(['single-event', 'complement'], summary, now)).toEqual(['single-event']);
  });

  it('derives useful review state from legacy aggregate practice stats', () => {
    const state = conceptReviewState(
      'single-event',
      {
        ...baseSummary,
        practiceStats: {
          'single-event': {
            answered: 10,
            correct: 7,
            bestLevel: 4,
            lastLevel: 4,
            lastPracticed: '2026-06-27T00:00:00.000Z',
          },
        },
      },
      new Date('2026-06-27T12:00:00.000Z'),
    );

    expect(state.recentMisses).toBe(3);
    expect(state.successStreak).toBe(0);
    expect(state.isDue).toBe(true);
  });
});

describe('review recommendations', () => {
  it('prefers due review, recent misses, weak evidence, then first practice', () => {
    const now = new Date('2026-06-27T12:00:00.000Z');
    const summary: UserSummary = {
      ...baseSummary,
      practiceStats: {
        'single-event': {
          answered: 6,
          correct: 6,
          bestLevel: 5,
          lastLevel: 5,
          lastPracticed: '2026-06-25T08:00:00.000Z',
          lastReviewed: '2026-06-25T08:00:00.000Z',
          recentMisses: 0,
          successStreak: 1,
        },
        complement: {
          answered: 5,
          correct: 4,
          bestLevel: 4,
          lastLevel: 4,
          lastPracticed: '2026-06-27T11:00:00.000Z',
          lastReviewed: '2026-06-27T11:00:00.000Z',
          recentMisses: 1,
          successStreak: 0,
        },
        'and-multiply': {
          answered: 5,
          correct: 3,
          bestLevel: 3,
          lastLevel: 3,
          lastPracticed: '2026-06-27T11:00:00.000Z',
          lastReviewed: '2026-06-27T11:00:00.000Z',
          recentMisses: 0,
          successStreak: 0,
        },
      },
    };

    const recommendations = recommendedReviewConcepts(
      ['single-event', 'complement', 'and-multiply', 'conditional'],
      summary,
      now,
      () => 'completed',
      4,
    );

    expect(recommendations.map((entry) => entry.conceptId)).toEqual([
      'single-event',
      'complement',
      'and-multiply',
      'conditional',
    ]);
    expect(recommendations.map((entry) => entry.reason)).toEqual([
      'due',
      'recent-misses',
      'low-accuracy',
      'new',
    ]);
  });

  it('suggests unlocked concepts that need first practice', () => {
    const recommendations = recommendedReviewConcepts(
      ['single-event', 'complement'],
      baseSummary,
      new Date('2026-06-27T12:00:00.000Z'),
      () => 'completed',
    );

    expect(recommendations.map((entry) => entry.reason)).toEqual(['new', 'new']);
    expect(recommendations.every((entry) => entry.detail.includes('first practice'))).toBe(true);
  });
});

describe('interleaved practice slots', () => {
  it('prioritizes due and weak concepts while avoiding adjacent repeats', () => {
    const now = new Date('2026-06-27T12:00:00.000Z');
    const summary: UserSummary = {
      ...baseSummary,
      practiceStats: {
        'single-event': {
          answered: 4,
          correct: 2,
          bestLevel: 3,
          lastLevel: 3,
          lastPracticed: '2026-06-27T08:00:00.000Z',
          recentMisses: 2,
          successStreak: 0,
        },
        complement: {
          answered: 5,
          correct: 5,
          bestLevel: 4,
          lastLevel: 4,
          lastPracticed: '2026-06-27T08:00:00.000Z',
          recentMisses: 0,
          successStreak: 4,
        },
        'and-multiply': {
          answered: 5,
          correct: 4,
          bestLevel: 4,
          lastLevel: 4,
          lastPracticed: '2026-06-27T08:00:00.000Z',
          recentMisses: 0,
          successStreak: 1,
        },
      },
    };

    const slots = buildPracticeSessionSlots(
      ['single-event', 'complement', 'and-multiply'],
      summary,
      50,
      { questionCount: 6, difficultyMode: 'adaptive' },
      now,
    );
    const conceptOrder = slots.map((slot) => slot.conceptId);

    expect(slots).toHaveLength(6);
    expect(conceptOrder[0]).toBe('single-event');
    expect(conceptOrder.some((concept, index) => index > 0 && concept === conceptOrder[index - 1])).toBe(false);
    expect(conceptOrder.filter((concept) => concept === 'single-event')).toHaveLength(3);
    expect(slots.map((slot) => slot.seed)).toEqual([50, 51, 52, 53, 54, 55]);
  });

  it('uses an ordered starter rotation for unlimited sessions', () => {
    const now = new Date('2026-06-27T12:00:00.000Z');
    const summary: UserSummary = {
      ...baseSummary,
      practiceStats: {
        complement: {
          answered: 3,
          correct: 1,
          bestLevel: 2,
          lastLevel: 2,
          lastPracticed: '2026-06-27T09:00:00.000Z',
          recentMisses: 2,
          successStreak: 0,
        },
      },
    };

    expect(orderPracticeConceptsForSession(['single-event', 'complement'], summary, now)[0]).toBe('complement');
    expect(
      buildPracticeSessionSlots(
        ['single-event', 'complement'],
        summary,
        1,
        { questionCount: 'unlimited', difficultyMode: 6 },
        now,
      ).map((slot) => [slot.conceptId, slot.level]),
    ).toEqual([
      ['complement', 6],
      ['single-event', 6],
    ]);
  });
});
