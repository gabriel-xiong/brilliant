import { describe, expect, it } from 'vitest';
import { scrambleOrderIds } from './SortOrderInteraction';
import { allLessons } from '../../models/lesson';
import type { ProblemStep } from '../../models/lesson';

const orderSteps = allLessons.flatMap((lesson) =>
  lesson.steps.filter(
    (step): step is ProblemStep => step.type === 'problem' && (step as ProblemStep).format === 'order',
  ),
);

describe('scrambleOrderIds', () => {
  it('produces a non-solved permutation for every shipped order step', () => {
    expect(orderSteps.length).toBeGreaterThan(0);
    for (const step of orderSteps) {
      const ids = (step.orderItems ?? []).map((item) => item.id);
      const solution = step.orderSolution ?? [];
      const scrambled = scrambleOrderIds(ids, solution, step.stepId);

      // Same multiset of ids (a real permutation, nothing dropped/duplicated).
      expect([...scrambled].sort()).toEqual([...ids].sort());
      // Never opens already solved.
      expect(scrambled).not.toEqual(solution);
    }
  });

  it('is deterministic and stable for a given seed', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const solution = ['a', 'b', 'c', 'd'];
    const first = scrambleOrderIds(ids, solution, 'step-x');
    const second = scrambleOrderIds(ids, solution, 'step-x');
    expect(second).toEqual(first);
    expect(first).not.toEqual(solution);
  });

  it('guarantees a non-solved order even for two items', () => {
    // The only non-solved arrangement of two distinct items is the reverse.
    expect(scrambleOrderIds(['a', 'b'], ['a', 'b'], 'seed')).toEqual(['b', 'a']);
  });

  it('returns degenerate single/empty sets unchanged without looping', () => {
    expect(scrambleOrderIds(['only'], ['only'], 'seed')).toEqual(['only']);
    expect(scrambleOrderIds([], [], 'seed')).toEqual([]);
  });
});
