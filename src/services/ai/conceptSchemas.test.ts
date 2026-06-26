import { describe, expect, it } from 'vitest';
import {
  ALL_CONCEPTS,
  CONCEPT_LABELS,
  conceptsForLessonId,
  generateProblem,
  solveConcept,
} from './conceptSchemas';
import type { Difficulty } from './types';

describe('solveConcept — exact hand-checked cases', () => {
  it('single-event: 2 of 6 -> 1/3', () => {
    const r = solveConcept('single-event', { favorable: 2, total: 6 });
    expect(r.fraction).toBe('1/3');
    expect(r.decimal).toBeCloseTo(0.3333, 4);
    expect(r.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('complement: not (2 of 6) -> 2/3', () => {
    const r = solveConcept('complement', { favorable: 2, total: 6 });
    expect(r.fraction).toBe('2/3');
    expect(r.decimal).toBeCloseTo(0.6667, 4);
  });

  it('and-multiply: 1/2 * 1/6 -> 1/12', () => {
    const r = solveConcept('and-multiply', { favA: 1, totA: 2, favB: 1, totB: 6 });
    expect(r.fraction).toBe('1/12');
    expect(r.decimal).toBeCloseTo(1 / 12, 6);
  });

  it('or-inclusion-exclusion: (3 + 2 - 1)/6 -> 2/3', () => {
    const r = solveConcept('or-inclusion-exclusion', {
      total: 6,
      countA: 3,
      countB: 2,
      countBoth: 1,
    });
    expect(r.fraction).toBe('2/3');
    expect(r.decimal).toBeCloseTo(0.6667, 4);
  });

  it('conditional: 20 of 50 -> 2/5', () => {
    const r = solveConcept('conditional', { countB: 50, countAandB: 20 });
    expect(r.fraction).toBe('2/5');
    expect(r.decimal).toBeCloseTo(0.4, 6);
  });

  it('expected-value: 1/2 * 10 + 1/2 * 0 -> 5', () => {
    const r = solveConcept('expected-value', {
      pNum: 1,
      pDen: 2,
      payoffWin: 10,
      payoffLose: 0,
    });
    expect(r.fraction).toBe('5');
    expect(r.decimal).toBeCloseTo(5, 6);
  });

  it('expected-value: 1/6 * 12 + 5/6 * -3 -> -1/2', () => {
    const r = solveConcept('expected-value', {
      pNum: 1,
      pDen: 6,
      payoffWin: 12,
      payoffLose: -3,
    });
    // 12/6 - 15/6 = -3/6 = -1/2
    expect(r.fraction).toBe('-1/2');
    expect(r.decimal).toBeCloseTo(-0.5, 6);
  });

  it('bayes: prior 0.5, sens 0.9, fp 0.1 -> 9/10', () => {
    const r = solveConcept('bayes', {
      priorH: 500,
      sensitivity: 900,
      falsePositive: 100,
    });
    expect(r.fraction).toBe('9/10');
    expect(r.decimal).toBeCloseTo(0.9, 6);
  });

  it('bayes: rare disease (prior 1%, sens 90%, fp 9%) is exact and surprising', () => {
    const r = solveConcept('bayes', {
      priorH: 10,
      sensitivity: 900,
      falsePositive: 90,
    });
    // (0.01*0.9) / (0.01*0.9 + 0.99*0.09) = 0.009 / (0.009 + 0.0891) = 0.009/0.0981 = 10/109
    expect(r.fraction).toBe('10/109');
    expect(r.decimal).toBeCloseTo(10 / 109, 6);
  });

  it('never throws on degenerate params (zero total)', () => {
    expect(() => solveConcept('single-event', { favorable: 1, total: 0 })).not.toThrow();
    const r = solveConcept('single-event', { favorable: 1, total: 0 });
    expect(r.fraction).toBe('0');
    expect(r.decimal).toBe(0);
  });
});

describe('generateProblem — determinism and round-trip integrity', () => {
  const difficulties: Difficulty[] = ['intro', 'core', 'challenge'];

  it('is deterministic for a fixed seed', () => {
    const a = generateProblem('single-event', 'core', 12345);
    const b = generateProblem('single-event', 'core', 12345);
    expect(a).toEqual(b);
  });

  it('different seeds can produce different problems', () => {
    const a = generateProblem('conditional', 'challenge', 1);
    const b = generateProblem('conditional', 'challenge', 2);
    // Not a hard guarantee for every pair, but these seeds differ.
    expect(a.id).not.toBe(b.id);
  });

  it('uses a stable id format', () => {
    const p = generateProblem('bayes', 'intro', 7);
    expect(p.id).toBe('bayes-intro-7');
  });

  it('round-trips for every concept x difficulty x several seeds', () => {
    for (const conceptId of ALL_CONCEPTS) {
      for (const difficulty of difficulties) {
        for (const seed of [1, 2, 7, 42, 99, 1000]) {
          const p = generateProblem(conceptId, difficulty, seed);

          // acceptedAnswer/decimal mirror the embedded solution exactly.
          expect(p.acceptedAnswer).toBe(p.solution.fraction);
          expect(p.acceptedDecimal).toBe(p.solution.decimal);

          // Re-solving the params reproduces the same answer (truth engine).
          const reSolved = solveConcept(conceptId, p.params);
          expect(reSolved.fraction).toBe(p.solution.fraction);
          expect(reSolved.decimal).toBe(p.solution.decimal);

          // Sanity on shape.
          expect(p.prompt.length).toBeGreaterThan(0);
          expect(p.tolerance).toBeGreaterThanOrEqual(0);
          expect(p.solution.steps.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('generates valid inclusion-exclusion params (union never exceeds total)', () => {
    for (const difficulty of difficulties) {
      for (let seed = 0; seed < 25; seed++) {
        const p = generateProblem('or-inclusion-exclusion', difficulty, seed);
        const { total, countA, countB, countBoth } = p.params;
        expect(countBoth).toBeLessThanOrEqual(Math.min(countA, countB));
        expect(countA + countB - countBoth).toBeLessThanOrEqual(total);
        expect(p.acceptedDecimal).toBeGreaterThanOrEqual(0);
        expect(p.acceptedDecimal).toBeLessThanOrEqual(1);
      }
    }
  });

  it('probability concepts produce answers within [0, 1]', () => {
    const probConcepts = [
      'single-event',
      'complement',
      'and-multiply',
      'or-inclusion-exclusion',
      'conditional',
      'bayes',
    ] as const;
    for (const conceptId of probConcepts) {
      for (const difficulty of difficulties) {
        for (let seed = 0; seed < 10; seed++) {
          const p = generateProblem(conceptId, difficulty, seed);
          expect(p.acceptedDecimal).toBeGreaterThanOrEqual(0);
          expect(p.acceptedDecimal).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('lesson + label maps', () => {
  it('maps the seven lessons to their concepts', () => {
    expect(conceptsForLessonId('intro-basic-probability')).toEqual(['single-event']);
    expect(conceptsForLessonId('counting-outcomes')).toEqual(['single-event', 'complement']);
    expect(conceptsForLessonId('compound-events')).toEqual(['and-multiply']);
    expect(conceptsForLessonId('dependent-events')).toEqual(['conditional']);
    expect(conceptsForLessonId('mutually-exclusive-events')).toEqual(['or-inclusion-exclusion']);
    expect(conceptsForLessonId('expected-value')).toEqual(['expected-value']);
    expect(conceptsForLessonId('bayes-updating')).toEqual(['bayes']);
  });

  it('returns an empty array for unknown lessons', () => {
    expect(conceptsForLessonId('does-not-exist')).toEqual([]);
  });

  it('has a friendly label for every concept', () => {
    for (const conceptId of ALL_CONCEPTS) {
      expect(CONCEPT_LABELS[conceptId]).toBeTruthy();
    }
  });
});
