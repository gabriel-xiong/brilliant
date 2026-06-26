import { describe, expect, it } from 'vitest';
import {
  gradeMultiStage,
  isOrderCorrect,
  isSortCorrect,
  isStageCorrect,
  numericAnswersMatch,
  parseNumericValue,
  serializeOrderAnswer,
  serializeSortAnswer,
} from './answerCheck';
import type { ProblemStep, QuestionStage } from '../models/lesson';
import { allLessons } from '../models/lesson';

describe('parseNumericValue', () => {
  it('parses fractions, decimals, and percents to the same value', () => {
    expect(parseNumericValue('1/2')).toBeCloseTo(0.5, 10);
    expect(parseNumericValue('0.5')).toBeCloseTo(0.5, 10);
    expect(parseNumericValue('.5')).toBeCloseTo(0.5, 10);
    expect(parseNumericValue('50%')).toBeCloseTo(0.5, 10);
    expect(parseNumericValue('50 %')).toBeCloseTo(0.5, 10);
  });

  it('parses whole numbers for count answers', () => {
    expect(parseNumericValue('100')).toBe(100);
    expect(parseNumericValue(' 10 ')).toBe(10);
  });

  it('returns null for empty or non-numeric input', () => {
    expect(parseNumericValue('')).toBeNull();
    expect(parseNumericValue('   ')).toBeNull();
    expect(parseNumericValue('half')).toBeNull();
    expect(parseNumericValue('1/0')).toBeNull();
    expect(parseNumericValue('abc%')).toBeNull();
  });
});

describe('numericAnswersMatch', () => {
  it('treats equivalent forms of one-half as equal', () => {
    expect(numericAnswersMatch('1/2', '0.5')).toBe(true);
    expect(numericAnswersMatch('0.5', '50%')).toBe(true);
    expect(numericAnswersMatch('.5', '1/2')).toBe(true);
    expect(numericAnswersMatch('50 %', '0.5')).toBe(true);
  });

  it('accepts rounded percents within tolerance', () => {
    // 2/6 = 0.3333..., "33%" = 0.33 -> gap ~0.0033, inside the default epsilon.
    expect(numericAnswersMatch('2/6', '33%')).toBe(true);
    expect(numericAnswersMatch('1/6', '16.7%')).toBe(true);
    expect(numericAnswersMatch('1/6', '17%')).toBe(true);
  });

  it('rejects wrong answers outside tolerance', () => {
    expect(numericAnswersMatch('0.4', '0.5')).toBe(false);
    expect(numericAnswersMatch('1/3', '1/2')).toBe(false);
    expect(numericAnswersMatch('75%', '50%')).toBe(false);
    expect(numericAnswersMatch('60', '100')).toBe(false);
  });

  it('rejects unparseable input even against a valid answer', () => {
    expect(numericAnswersMatch('', '0.5')).toBe(false);
    expect(numericAnswersMatch('nope', '1/6')).toBe(false);
  });

  it('honors a custom tolerance for count answers', () => {
    // Expected-count questions accept being off by one whole unit.
    expect(numericAnswersMatch('99', '100', 1)).toBe(true);
    expect(numericAnswersMatch('101', '100', 1)).toBe(true);
    expect(numericAnswersMatch('97', '100', 1)).toBe(false);
  });
});

describe('lesson 2-5 accepted-answer values', () => {
  it('accepts equivalent forms of the new fraction answers', () => {
    // Counting Outcomes: P(5 or 6) and P(4 or less).
    expect(numericAnswersMatch('2/6', '2/6')).toBe(true);
    expect(numericAnswersMatch('1/3', '2/6')).toBe(true);
    expect(numericAnswersMatch('33%', '2/6')).toBe(true);
    expect(numericAnswersMatch('2/3', '4/6')).toBe(true);
    expect(numericAnswersMatch('67%', '4/6')).toBe(true);
    // Compound Events: P(heads and 6) and P(tails and over 4).
    expect(numericAnswersMatch('0.08', '1/12')).toBe(true);
    expect(numericAnswersMatch('1/6', '2/12')).toBe(true);
    expect(numericAnswersMatch('17%', '2/12')).toBe(true);
    // Conditional Probability: P(rain | cloudy) variations.
    expect(numericAnswersMatch('3/5', '24/40')).toBe(true);
    expect(numericAnswersMatch('60%', '24/40')).toBe(true);
    expect(numericAnswersMatch('2/5', '20/50')).toBe(true);
    expect(numericAnswersMatch('1/2', '2/4')).toBe(true);
    // Mutually Exclusive: union of non-overlapping events.
    expect(numericAnswersMatch('83%', '5/6')).toBe(true);
  });

  it('rejects close-but-wrong answers for the new fraction values', () => {
    expect(numericAnswersMatch('1/6', '2/6')).toBe(false);
    expect(numericAnswersMatch('1/2', '4/6')).toBe(false);
    expect(numericAnswersMatch('1/6', '3/12')).toBe(false);
    expect(numericAnswersMatch('1/2', '24/40')).toBe(false);
  });

  it('honors the looser tolerance on expected-count answers', () => {
    // Counting Outcomes expects ~60 even rolls out of 120, allowing wobble.
    expect(numericAnswersMatch('60', '60', 6)).toBe(true);
    expect(numericAnswersMatch('55', '60', 6)).toBe(true);
    expect(numericAnswersMatch('66', '60', 6)).toBe(true);
    expect(numericAnswersMatch('40', '60', 6)).toBe(false);
  });

  it('accepts exact whole-number counts at the default tolerance', () => {
    expect(numericAnswersMatch('2', '2')).toBe(true);
    expect(numericAnswersMatch('8', '8')).toBe(true);
    expect(numericAnswersMatch('1', '1')).toBe(true);
    expect(numericAnswersMatch('3', '2')).toBe(false);
  });

  it('grades the slider problems by their integer setting', () => {
    // Lesson 2: drag winning faces to P = 1/2 → 3 of 6 faces.
    expect(numericAnswersMatch('3', '3')).toBe(true);
    expect(numericAnswersMatch('2', '3')).toBe(false);
    expect(numericAnswersMatch('4', '3')).toBe(false);
    // Lesson 5: tune the overlap until P(A or B) = 2/3 → 2 shared sides.
    expect(numericAnswersMatch('2', '2')).toBe(true);
    expect(numericAnswersMatch('1', '2')).toBe(false);
    expect(numericAnswersMatch('3', '2')).toBe(false);
  });
});

describe('lesson 6-7 accepted-answer values', () => {
  it('accepts equivalent forms of the new expected-value answers', () => {
    // Expected value E[X] = 3 and scaled totals are whole numbers.
    expect(numericAnswersMatch('3', '3')).toBe(true);
    expect(numericAnswersMatch('3.0', '3')).toBe(true);
    expect(numericAnswersMatch('60', '60', 1)).toBe(true);
    // One wedge out of four.
    expect(numericAnswersMatch('1/4', '1/4')).toBe(true);
    expect(numericAnswersMatch('0.25', '1/4')).toBe(true);
    expect(numericAnswersMatch('25%', '1/4')).toBe(true);
  });

  it('handles the negative net-gain answers', () => {
    expect(numericAnswersMatch('-1', '-1')).toBe(true);
    expect(numericAnswersMatch('-10', '-10')).toBe(true);
    // A positive guess must not pass a negative expected net.
    expect(numericAnswersMatch('1', '-1')).toBe(false);
    expect(numericAnswersMatch('10', '-10')).toBe(false);
  });

  it('accepts equivalent forms of the new Bayes posterior answers', () => {
    // P(condition | positive) = 90/270 = 1/3 ≈ 33%.
    expect(numericAnswersMatch('1/3', '90/270')).toBe(true);
    expect(numericAnswersMatch('33%', '90/270')).toBe(true);
    expect(numericAnswersMatch('0.33', '90/270')).toBe(true);
    // Fresh screening: 40/160 = 1/4 = 25%.
    expect(numericAnswersMatch('1/4', '40/160')).toBe(true);
    expect(numericAnswersMatch('25%', '40/160')).toBe(true);
    // Whole-count table reads.
    expect(numericAnswersMatch('90', '90')).toBe(true);
    expect(numericAnswersMatch('180', '180')).toBe(true);
    expect(numericAnswersMatch('270', '270')).toBe(true);
  });

  it('rejects close-but-wrong answers for the new values', () => {
    expect(numericAnswersMatch('1/2', '90/270')).toBe(false);
    expect(numericAnswersMatch('90%', '90/270')).toBe(false);
    expect(numericAnswersMatch('1/3', '40/160')).toBe(false);
    expect(numericAnswersMatch('4', '3')).toBe(false);
  });
});

describe('multi-stage scoring', () => {
  const stages: QuestionStage[] = [
    {
      stageId: 'p',
      format: 'free-response',
      prompt: 'P(Face 4)?',
      acceptedAnswer: '1/6',
      tolerance: 0.02,
      explanation: '1/6',
    },
    {
      stageId: 'count',
      format: 'free-response',
      prompt: 'Expected in 600 spins?',
      acceptedAnswer: '100',
      tolerance: 1,
      explanation: '100',
    },
    {
      stageId: 'interpret',
      format: 'multiple-choice',
      prompt: 'Best interpretation?',
      choices: [
        { label: 'Impossible', value: 'impossible' },
        { label: 'Unlikely, not impossible', value: 'wobble' },
      ],
      answer: 'wobble',
      explanation: 'rare is not impossible',
    },
  ];

  it('grades each stage with the right strategy', () => {
    expect(isStageCorrect(stages[0], '16.7%')).toBe(true);
    expect(isStageCorrect(stages[0], '1/2')).toBe(false);
    expect(isStageCorrect(stages[1], '100')).toBe(true);
    expect(isStageCorrect(stages[2], 'wobble')).toBe(true);
    expect(isStageCorrect(stages[2], 'impossible')).toBe(false);
  });

  it('reports allCorrect only when every stage is right', () => {
    expect(gradeMultiStage(stages, ['1/6', '100', 'wobble'])).toMatchObject({
      perStage: [true, true, true],
      allCorrect: true,
    });
    expect(gradeMultiStage(stages, ['1/6', '60', 'wobble'])).toMatchObject({
      perStage: [true, false, true],
      allCorrect: false,
    });
    expect(gradeMultiStage(stages, ['1/6', '100', 'impossible']).allCorrect).toBe(false);
  });
});

/**
 * Data-driven integrity sweep over the shipped lesson content. These guard
 * against a future content edit introducing an unparseable accepted answer, a
 * multiple-choice answer whose value is not among its choices, or a tolerance
 * so loose that a question accepts its own answer only by luck. The sweep walks
 * every problem (and every stage) in `allLessons`, so new lessons/questions are
 * covered automatically.
 */
describe('isSortCorrect (drag-into-buckets grading)', () => {
  const solution = { '2': 'fav', '4': 'fav', '1': 'other', '3': 'other', '5': 'other', '6': 'other' };

  it('accepts a fully correct placement regardless of key order', () => {
    expect(isSortCorrect(solution, serializeSortAnswer(solution))).toBe(true);
    // Key insertion order must not matter.
    const shuffled = { '6': 'other', '2': 'fav', '5': 'other', '4': 'fav', '1': 'other', '3': 'other' };
    expect(isSortCorrect(solution, serializeSortAnswer(shuffled))).toBe(true);
  });

  it('rejects a single misplaced item', () => {
    const wrong = { ...solution, '6': 'fav' };
    expect(isSortCorrect(solution, serializeSortAnswer(wrong))).toBe(false);
  });

  it('rejects an incomplete placement (item still in the tray)', () => {
    const partial = { '2': 'fav', '4': 'fav' };
    expect(isSortCorrect(solution, serializeSortAnswer(partial))).toBe(false);
  });

  it('rejects empty or unparseable input', () => {
    expect(isSortCorrect(solution, '')).toBe(false);
    expect(isSortCorrect(solution, 'not json')).toBe(false);
    expect(isSortCorrect(solution, '[]')).toBe(false);
  });
});

describe('isOrderCorrect (arrange-in-sequence grading)', () => {
  const solution = ['impossible', 'one-face', 'heads'];

  it('accepts the exact order', () => {
    expect(isOrderCorrect(solution, serializeOrderAnswer(solution))).toBe(true);
  });

  it('rejects a swapped or reversed order', () => {
    expect(isOrderCorrect(solution, serializeOrderAnswer(['one-face', 'impossible', 'heads']))).toBe(false);
    expect(isOrderCorrect(solution, serializeOrderAnswer([...solution].reverse()))).toBe(false);
  });

  it('rejects wrong-length or unparseable input', () => {
    expect(isOrderCorrect(solution, serializeOrderAnswer(['impossible', 'heads']))).toBe(false);
    expect(isOrderCorrect(solution, '')).toBe(false);
    expect(isOrderCorrect(solution, '{}')).toBe(false);
  });
});

describe('interactive step content integrity (allLessons)', () => {
  it('every sort step has buckets and a complete, valid solution', () => {
    const sortSteps = allLessons.flatMap((lesson) =>
      lesson.steps
        .filter((step): step is ProblemStep => step.type === 'problem' && step.format === 'sort')
        .map((step) => ({ lessonId: lesson.lessonId, step }))
    );
    // The conversions add at least one sort step.
    expect(sortSteps.length).toBeGreaterThan(0);
    for (const { lessonId, step } of sortSteps) {
      const label = `${lessonId}/${step.stepId}`;
      const items = step.sortItems ?? [];
      const buckets = step.sortBuckets ?? [];
      const solution = step.sortSolution ?? {};
      const bucketIds = new Set(buckets.map((bucket) => bucket.id));
      expect(items.length, `${label} should define items`).toBeGreaterThan(0);
      expect(buckets.length, `${label} should define at least two buckets`).toBeGreaterThanOrEqual(2);
      // Every item has exactly one solution entry pointing at a real bucket.
      expect(Object.keys(solution).length, `${label} solution should cover every item`).toBe(items.length);
      for (const item of items) {
        const target = solution[item.id];
        expect(target, `${label} item "${item.id}" should have a solution bucket`).toBeTruthy();
        expect(bucketIds.has(target), `${label} item "${item.id}" maps to a known bucket`).toBe(true);
      }
      // The canonical solution must grade as correct.
      expect(isSortCorrect(solution, serializeSortAnswer(solution)), `${label} accepts its own solution`).toBe(true);
    }
  });

  it('every order step has items and a solution that is a permutation of them', () => {
    const orderSteps = allLessons.flatMap((lesson) =>
      lesson.steps
        .filter((step): step is ProblemStep => step.type === 'problem' && step.format === 'order')
        .map((step) => ({ lessonId: lesson.lessonId, step }))
    );
    expect(orderSteps.length).toBeGreaterThan(0);
    for (const { lessonId, step } of orderSteps) {
      const label = `${lessonId}/${step.stepId}`;
      const items = step.orderItems ?? [];
      const solution = step.orderSolution ?? [];
      expect(items.length, `${label} should define items`).toBeGreaterThan(1);
      expect(solution.length, `${label} solution should rank every item once`).toBe(items.length);
      const itemIds = new Set(items.map((item) => item.id));
      expect(new Set(solution).size, `${label} solution has no duplicate ids`).toBe(solution.length);
      for (const id of solution) {
        expect(itemIds.has(id), `${label} solution id "${id}" is a real item`).toBe(true);
      }
      expect(isOrderCorrect(solution, serializeOrderAnswer(solution)), `${label} accepts its own solution`).toBe(true);
    }
  });
});

describe('lesson content answer integrity (allLessons)', () => {
  const problems = allLessons.flatMap((lesson) =>
    lesson.steps
      .filter((step): step is ProblemStep => step.type === 'problem')
      .map((step) => ({ lessonId: lesson.lessonId, step }))
  );

  function assertFreeResponse(label: string, acceptedAnswer: string | undefined, tolerance: number | undefined) {
    expect(acceptedAnswer, `${label} should define an acceptedAnswer`).toBeTruthy();
    const value = parseNumericValue(acceptedAnswer ?? '');
    expect(value, `${label} acceptedAnswer "${acceptedAnswer}" should parse to a number`).not.toBeNull();
    expect(Number.isFinite(value as number), `${label} acceptedAnswer should be finite`).toBe(true);
    // A question must accept its own canonical answer under its own tolerance.
    expect(
      numericAnswersMatch(acceptedAnswer ?? '', acceptedAnswer ?? '', tolerance),
      `${label} should accept its own acceptedAnswer`
    ).toBe(true);
  }

  it('every free-response question/stage accepts its own answer', () => {
    for (const { lessonId, step } of problems) {
      const format = step.format ?? 'multiple-choice';
      // Slider questions submit the slider's integer setting and are graded by
      // the same numeric matcher as free-response, so they share this check.
      if (format === 'free-response' || format === 'slider') {
        assertFreeResponse(`${lessonId}/${step.stepId}`, step.acceptedAnswer, step.tolerance);
      } else if (format === 'multi-stage') {
        for (const stage of step.stages ?? []) {
          if (stage.format === 'free-response') {
            assertFreeResponse(`${lessonId}/${step.stepId}/${stage.stageId}`, stage.acceptedAnswer, stage.tolerance);
          }
        }
      }
    }
  });

  it('every multiple-choice answer is one of its own choices', () => {
    function assertChoiceAnswer(label: string, answer: string | undefined, choices: { value: string }[] | undefined) {
      expect(answer, `${label} should define an answer`).toBeTruthy();
      const values = (choices ?? []).map((choice) => choice.value);
      expect(values, `${label} answer "${answer}" should be a selectable choice`).toContain(answer);
    }

    for (const { lessonId, step } of problems) {
      const format = step.format ?? 'multiple-choice';
      if (format === 'multiple-choice') {
        assertChoiceAnswer(`${lessonId}/${step.stepId}`, step.answer, step.choices);
        for (const variant of step.variants ?? []) {
          assertChoiceAnswer(`${lessonId}/${step.stepId} (variant)`, variant.answer, variant.choices);
        }
      } else if (format === 'multi-stage') {
        for (const stage of step.stages ?? []) {
          if (stage.format === 'multiple-choice') {
            assertChoiceAnswer(`${lessonId}/${step.stepId}/${stage.stageId}`, stage.answer, stage.choices);
          }
        }
      }
    }
  });

  it('locks in the reworded answers that must match their embedded demos', () => {
    // Each entry: [lessonId, stepId, stageId | null, acceptedAnswer]. These are
    // the values the rollout reworded so a question agrees with its demo's
    // event/target. If a demo or wording drifts, update the demo+wording, not
    // these expectations.
    const expectations: [string, string, string | null, string][] = [
      // Lesson 1: single wheel face and expected counts.
      ['intro-basic-probability', 'problem-dice-probability', 'stage-single-spin', '1/6'],
      ['intro-basic-probability', 'problem-dice-probability', 'stage-expected-count', '100'],
      // (problem-even-dice is now a single interpretation multiple-choice step — no free-response stage to lock.)
      // Lesson 2: counting events off the highlighted die sides.
      ['counting-outcomes', 'problem-count-the-event', 'stage-successful-count', '2'],
      ['counting-outcomes', 'problem-count-the-event', 'stage-event-probability', '2/6'],
      // Slider problem: drag winning faces until P = 1/2 → 3 of 6 faces.
      ['counting-outcomes', 'problem-as-likely-as-not', null, '3'],
      // Complement step ("events have opposites"): "not 6" highlights 5 sides, P(not 6) = 5/6.
      ['counting-outcomes', 'problem-complement-count', 'stage-unsuccessful-count', '5'],
      ['counting-outcomes', 'problem-complement-count', 'stage-complement-probability', '5/6'],
      ['counting-outcomes', 'problem-expected-frequency', null, '60'],
      // (problem-even-not-six is now a drag-to-bucket `sort` step — no acceptedAnswer to lock.)
      // Lesson 3: compound "and" pairs and the area model.
      ['compound-events', 'problem-count-pairs', 'stage-count-pairs', '1'],
      ['compound-events', 'problem-count-pairs', 'stage-pair-probability', '1/12'],
      // (problem-tails-over-four is now an `order`-by-likelihood step — no acceptedAnswer to lock.)
      // Lesson 4: conditioning shrinks the group.
      // (problem-condition-on-cloudy is now a `sort` of day-types into the conditioning group.)
      // Formula concept folded into the calculation step; the answer now lives in a stage.
      ['dependent-events', 'problem-conditional-formula', 'stage-apply-formula', '20/50'],
      ['dependent-events', 'problem-draw-dependence', 'stage-first-draw', '3/5'],
      ['dependent-events', 'problem-draw-dependence', 'stage-second-draw', '2/4'],
      // Lesson 5: unions, overlap, and inclusion–exclusion.
      // (problem-find-overlap is now a four-region `sort` of die faces — no acceptedAnswer to lock.)
      // Slider problem: tune the shared sides until P(A or B) = 2/3 → overlap 2.
      ['mutually-exclusive-events', 'problem-tune-the-overlap', null, '2'],
      // Overlap concept folded into the add step; now a two-part question (count, then probability).
      ['mutually-exclusive-events', 'problem-add-exclusive', 'stage-union-no-overlap', '5'],
      ['mutually-exclusive-events', 'problem-add-exclusive', 'stage-add-exclusive', '5/6'],
      ['mutually-exclusive-events', 'problem-double-count', 'stage-naive-sum', '8'],
      ['mutually-exclusive-events', 'problem-double-count', 'stage-true-union', '6'],
      // Lesson 6: expected value of the prize spinner (payoffs 0,2,4,6).
      ['expected-value', 'problem-compute-expected-value', 'stage-wedge-prob', '1/4'],
      ['expected-value', 'problem-compute-expected-value', 'stage-expected-value', '3'],
      // (problem-expected-winnings is now an `order`-by-expected-value step — no acceptedAnswer to lock.)
      // Fair-game step: net per play (3 − 4) and net over 10 plays.
      ['expected-value', 'problem-fair-game', 'stage-net-per-play', '-1'],
      ['expected-value', 'problem-fair-game', 'stage-net-total', '-10'],
      // Lesson 7: natural-frequency table (100 of 1000 sick, 90% sens, 20% fpr).
      // (problem-build-counts is now a `sort` labeling the four test/condition groups.)
      ['bayes-updating', 'problem-find-posterior', 'stage-total-positive', '270'],
      ['bayes-updating', 'problem-find-posterior', 'stage-posterior', '90/270'],
      // Fresh screening: 40 true positives out of 160 total positives.
      ['bayes-updating', 'problem-posterior-fresh', null, '40/160'],
    ];

    for (const [lessonId, stepId, stageId, expected] of expectations) {
      const lesson = allLessons.find((entry) => entry.lessonId === lessonId);
      expect(lesson, `lesson ${lessonId} should exist`).toBeTruthy();
      const step = lesson!.steps.find((entry) => entry.stepId === stepId) as ProblemStep | undefined;
      expect(step, `${lessonId}/${stepId} should exist`).toBeTruthy();
      const accepted = stageId
        ? step!.stages?.find((stage) => stage.stageId === stageId)?.acceptedAnswer
        : step!.acceptedAnswer;
      expect(accepted, `${lessonId}/${stepId}${stageId ? `/${stageId}` : ''} accepted answer`).toBe(expected);
    }
  });

  it('accepts learner-friendly equivalent forms for the probability answers', () => {
    // Fraction probabilities should still pass when entered as a reduced
    // fraction, decimal, or whole-number percent.
    expect(numericAnswersMatch('1/3', '2/6')).toBe(true);
    expect(numericAnswersMatch('33%', '2/6')).toBe(true);
    expect(numericAnswersMatch('2/3', '4/6')).toBe(true);
    expect(numericAnswersMatch('67%', '4/6')).toBe(true);
    expect(numericAnswersMatch('0.83', '5/6')).toBe(true);
    expect(numericAnswersMatch('8%', '1/12')).toBe(true);
    expect(numericAnswersMatch('1/6', '2/12')).toBe(true);
    expect(numericAnswersMatch('60%', '24/40')).toBe(true);
    expect(numericAnswersMatch('40%', '20/50')).toBe(true);
    expect(numericAnswersMatch('0.5', '2/4')).toBe(true);
    expect(numericAnswersMatch('60%', '3/5')).toBe(true);
    expect(numericAnswersMatch('16.7%', '1/6')).toBe(true);
  });
});
