import { describe, expect, it } from 'vitest';
import {
  MAX_LEVEL,
  MIN_LEVEL,
  buildExamSlots,
  clampLevel,
  nextLevel,
  nextLevelForMode,
  startLevelForMode,
} from './practiceService';
import { ALL_CONCEPTS } from './ai/conceptSchemas';

describe('clampLevel', () => {
  it('clamps into the valid range and rounds', () => {
    expect(clampLevel(0)).toBe(MIN_LEVEL);
    expect(clampLevel(99)).toBe(MAX_LEVEL);
    expect(clampLevel(4.6)).toBe(5);
    expect(clampLevel(Number.NaN)).toBe(MIN_LEVEL);
  });
});

describe('nextLevelForMode', () => {
  it('adapts in adaptive mode (matches nextLevel)', () => {
    expect(nextLevelForMode('adaptive', 3, true, 2)).toBe(nextLevel(3, true, 2));
    expect(nextLevelForMode('adaptive', 5, false, 0)).toBe(nextLevel(5, false, 0));
  });

  it('holds a pinned level regardless of result', () => {
    expect(nextLevelForMode(6, 6, true, 5)).toBe(6);
    expect(nextLevelForMode(6, 6, false, 0)).toBe(6);
    expect(nextLevelForMode(99, 3, true, 4)).toBe(MAX_LEVEL);
  });
});

describe('startLevelForMode', () => {
  it('seeds from mastery in adaptive mode', () => {
    expect(startLevelForMode('adaptive', 'single-event', null)).toBe(1);
  });

  it('uses the pinned level (clamped) when fixed', () => {
    expect(startLevelForMode(7, 'bayes', null)).toBe(7);
    expect(startLevelForMode(50, 'bayes', null)).toBe(MAX_LEVEL);
  });
});

describe('buildExamSlots configurable', () => {
  it('defaults to one slot per concept, adaptive', () => {
    const slots = buildExamSlots(null, 1);
    expect(slots).toHaveLength(ALL_CONCEPTS.length);
    expect(slots.map((s) => s.conceptId)).toEqual([...ALL_CONCEPTS]);
  });

  it('honors a custom count by round-robin over concepts', () => {
    const count = ALL_CONCEPTS.length + 3;
    const slots = buildExamSlots(null, 1, { questionCount: count, difficultyMode: 'adaptive' });
    expect(slots).toHaveLength(count);
    expect(slots[ALL_CONCEPTS.length].conceptId).toBe(slots[0].conceptId);
  });

  it('pins every slot to a fixed level when difficulty is a number', () => {
    const slots = buildExamSlots(null, 1, { questionCount: 5, difficultyMode: 8 });
    expect(slots).toHaveLength(5);
    for (const s of slots) expect(s.difficulty).toBe(8);
  });

  it('is deterministic for the same inputs', () => {
    const a = buildExamSlots(null, 42, { questionCount: 6, difficultyMode: 3 });
    const b = buildExamSlots(null, 42, { questionCount: 6, difficultyMode: 3 });
    expect(a).toEqual(b);
  });

  it('never produces fewer than 1 slot', () => {
    expect(buildExamSlots(null, 1, { questionCount: 0, difficultyMode: 'adaptive' })).toHaveLength(1);
  });
});
