import { describe, expect, it } from 'vitest';
import { getConceptReadiness, getMasteryLabel, getPracticeReadinessSummary } from './masteryLabels';

describe('getMasteryLabel', () => {
  it('returns learner-facing labels for current statuses', () => {
    expect(getMasteryLabel('not-started')).toBe('Not started');
    expect(getMasteryLabel('in-progress')).toBe('In progress');
    expect(getMasteryLabel('almost-done')).toBe('Almost done');
    expect(getMasteryLabel('completed')).toBe('Needs practice');
    expect(getMasteryLabel('proficient')).toBe('Proficient');
    expect(getMasteryLabel('mastered')).toBe('Mastered');
  });

  it('maps legacy status names into current labels', () => {
    expect(getMasteryLabel('exploring')).toBe('In progress');
    expect(getMasteryLabel('building')).toBe('In progress');
    expect(getMasteryLabel('practice-ready')).toBe('Needs practice');
  });

  it('falls back to not started when no status exists', () => {
    expect(getMasteryLabel()).toBe('Not started');
  });
});

describe('concept readiness labels', () => {
  it('keeps new or low-sample concepts in needs practice', () => {
    expect(getConceptReadiness(undefined)).toMatchObject({
      status: 'needs-practice',
      label: 'Needs practice',
    });
    expect(
      getConceptReadiness({
        answered: 2,
        correct: 2,
        bestLevel: 3,
        lastLevel: 3,
        lastPracticed: '2026-06-27T00:00:00.000Z',
      }),
    ).toMatchObject({ status: 'needs-practice' });
  });

  it('treats recent misses as review work even with decent aggregate accuracy', () => {
    expect(
      getConceptReadiness({
        answered: 10,
        correct: 9,
        bestLevel: 7,
        lastLevel: 7,
        lastPracticed: '2026-06-27T00:00:00.000Z',
        recentMisses: 1,
        successStreak: 0,
      }),
    ).toMatchObject({ status: 'needs-practice', label: 'Needs practice' });
  });

  it('separates proficient from mastered by requiring a correct streak', () => {
    expect(
      getConceptReadiness({
        answered: 5,
        correct: 4,
        bestLevel: 5,
        lastLevel: 5,
        lastPracticed: '2026-06-27T00:00:00.000Z',
        recentMisses: 0,
        successStreak: 1,
      }),
    ).toMatchObject({ status: 'proficient', label: 'Proficient' });

    expect(
      getConceptReadiness({
        answered: 10,
        correct: 9,
        bestLevel: 8,
        lastLevel: 8,
        lastPracticed: '2026-06-27T00:00:00.000Z',
        recentMisses: 0,
        successStreak: 3,
      }),
    ).toMatchObject({ status: 'mastered', label: 'Mastered' });
  });

  it('summarizes exam practice readiness without creating a hard lock', () => {
    const summary = getPracticeReadinessSummary(
      {
        lastActiveDate: '2026-06-27',
        currentStreak: 1,
        longestStreak: 1,
        masterySummary: {},
        practiceStats: {
          'single-event': {
            answered: 10,
            correct: 9,
            bestLevel: 8,
            lastLevel: 8,
            lastPracticed: '2026-06-27T00:00:00.000Z',
            recentMisses: 0,
            successStreak: 3,
          },
          complement: {
            answered: 4,
            correct: 2,
            bestLevel: 4,
            lastLevel: 4,
            lastPracticed: '2026-06-27T00:00:00.000Z',
            recentMisses: 2,
            successStreak: 0,
          },
        },
      },
      ['single-event', 'complement'],
    );

    expect(summary.readyForExamPractice).toBe(false);
    expect(summary.label).toBe('1 concept to review');
    expect(summary.reviewConcepts).toEqual(['complement']);
  });
});

