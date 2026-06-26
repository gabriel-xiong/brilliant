import { describe, expect, it } from 'vitest';
import { getMasteryLabel } from './masteryLabels';

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

