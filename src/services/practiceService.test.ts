import { describe, expect, it } from 'vitest';
import {
  MAX_LEVEL,
  MIN_LEVEL,
  bandToLevel,
  levelForConcept,
  levelToBand,
  nextLevel,
} from './practiceService';

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

  it('seeds a signed-out / empty learner at the lowest level', () => {
    expect(levelForConcept('single-event', null)).toBe(1);
    expect(levelForConcept('bayes', undefined)).toBe(1);
  });
});
