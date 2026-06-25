export type LessonStepType = 'concept' | 'simulation' | 'problem';

/**
 * Interactive demos that can be reused as the experiment behind a simulation
 * step OR embedded inline inside a concept/question step so learners almost
 * never read content without something to interact with.
 */
export type EmbeddedDemoType =
  | 'coin-flip'
  | 'dice-roll'
  | 'outcome-count'
  | 'dice-distribution'
  | 'compound-events'
  | 'and-multiply'
  | 'weather-conditional'
  | 'draw-dependence'
  | 'mutually-exclusive'
  | 'double-count-tally'
  | 'probability-slider'
  | 'overlap-slider';

/** A lightweight embedded interaction rendered alongside a step's body. */
export interface EmbeddedDemo {
  demoType: EmbeddedDemoType;
  target?: string;
  rolls?: number;
  /**
   * Optional rendering variant. `'simple'` strips a demo down to its bare
   * essentials (e.g. the coin demo shows only a Flip control, a running tally,
   * and P = heads/total) for an uncluttered first encounter with a concept.
   */
  variant?: 'simple';
  /**
   * Hide trial/roll controls and observed-frequency tallies on demos that
   * support it (e.g. the mutually-exclusive union view), for steps that teach
   * how a probability is built rather than empirical frequency. Independent of
   * `target`, so a demo can hide trials while still selecting an event preset.
   */
  hideTrials?: boolean;
}

export interface BaseStep {
  stepId: string;
  type: LessonStepType;
  title: string;
}

export interface ConceptStep extends BaseStep {
  type: 'concept';
  body: string;
  illustration?: string;
  /** Optional inline figure rendered alongside the concept body. */
  figure?: 'venn-or';
  /** Optional lightweight interactive demo rendered alongside the concept body. */
  demo?: EmbeddedDemo;
  /** When true, render the embedded demo above the body so the eye flows demo → text → Next. */
  demoFirst?: boolean;
  /**
   * Optional body content rendered BENEATH the embedded demo. Lets a step split
   * its text so some renders above the demo and the rest below it, so a learner
   * never faces a wall of text — the interactive demo breaks it up. Uses the same
   * `\n`-delimited string format as `body`.
   */
  bodyAfterDemo?: string;
}

export interface SimulationStep extends BaseStep {
  type: 'simulation';
  prompt: string;
  simulationType: EmbeddedDemoType;
  config: {
    rolls: number;
    target?: string;
  };
  reflectionPrompt: string;
  correctInterpretation: string;
}

export interface ProblemChoice {
  label: string;
  value: string;
}

export interface ProblemVariant {
  question: string;
  choices: ProblemChoice[];
  answer: string;
  explanation: string;
  incorrectFeedback?: string;
}

/**
 * How a question step is answered.
 * - `multiple-choice` (default): legacy single-select question.
 * - `free-response`: tolerant numeric entry with progressive hints.
 * - `multi-stage`: sequentially gated sub-questions that build on each other.
 * - `slider`: the learner drags a slider to a value and submits it; the slider
 *   setting IS the answer, graded against `acceptedAnswer` like a free response.
 */
export type ProblemFormat = 'multiple-choice' | 'free-response' | 'multi-stage' | 'slider';

/** A single gated stage inside a multi-stage question. */
export interface QuestionStage {
  stageId: string;
  format: 'free-response' | 'multiple-choice';
  prompt: string;
  explanation: string;
  incorrectFeedback?: string;
  /** Demo revealed once this stage becomes the active stage. */
  demo?: EmbeddedDemo;
  // free-response fields
  acceptedAnswer?: string;
  tolerance?: number;
  hints?: string[];
  unit?: string;
  placeholder?: string;
  // multiple-choice fields
  choices?: ProblemChoice[];
  answer?: string;
}

/**
 * Pre-question "explore" phase for a problem step. When present, the step opens
 * showing `body` (concept content) plus the step's demo so the learner can
 * experiment first. The question/stages stay hidden until the learner clicks the
 * Continue control, at which point they animate in. This lets a concept + its
 * demo and the question that follows live in a single scored step.
 */
export interface ExplorePhase {
  body: string;
  /** Label for the button that reveals the question. Defaults to "Continue". */
  continueLabel?: string;
}

export interface ProblemStep extends BaseStep {
  type: 'problem';
  /** Question format; omitting it means `multiple-choice` for backward compatibility. */
  format?: ProblemFormat;
  question: string;
  /**
   * Short orienting blurb shown as context above the demo/question (not the
   * question itself) so the learner knows what the slide is for before they
   * interact.
   */
  description?: string;
  explanation?: string;
  incorrectFeedback?: string;
  /** Optional inline demo so a question can carry its own interaction. */
  demo?: EmbeddedDemo;
  /** Optional pre-question explore phase (concept + demo, then reveal the question). */
  explore?: ExplorePhase;
  /**
   * When true, the embedded demo renders ABOVE the question text/controls so it
   * is immediately clear the demo is the thing being asked about and the prompt
   * below it is a question (not instructions).
   */
  demoFirst?: boolean;
  // multiple-choice fields
  choices?: ProblemChoice[];
  answer?: string;
  variants?: ProblemVariant[];
  // free-response fields (tolerant numeric grading + progressive hints)
  acceptedAnswer?: string;
  tolerance?: number;
  hints?: string[];
  unit?: string;
  placeholder?: string;
  // multi-stage fields
  stages?: QuestionStage[];
  intro?: string;
  // slider fields: the slider's integer setting is the submitted answer, graded
  // against `acceptedAnswer` with the free-response numeric matcher. The bound
  // demo (a `*-slider` demoType) renders the live visualization the learner
  // manipulates while solving.
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
}

export type LessonStep = ConceptStep | SimulationStep | ProblemStep;

export interface MasteryCriteria {
  minFirstAttemptAccuracy: number;
  minCompletedSteps: number;
}

export interface Lesson {
  lessonId: string;
  order: number;
  contentVersion: number;
  title: string;
  summary: string;
  tags: string[];
  estimatedMinutes: number;
  steps: LessonStep[];
  masteryCriteria: MasteryCriteria;
}

export const introBasicProbabilityLesson: Lesson = {
  lessonId: 'intro-basic-probability',
  order: 1,
  contentVersion: 24,
  title: 'What is probability?',
  summary: 'Build an intuition for chance by flipping, spinning, and testing your own predictions hands-on.',
  tags: ['basic-probability', 'coins', 'dice'],
  estimatedMinutes: 12,
  masteryCriteria: {
    minFirstAttemptAccuracy: 0.8,
    minCompletedSteps: 4,
  },
  steps: [
    {
      stepId: 'concept-what-is-probability',
      type: 'concept',
      title: 'What is probability?',
      body: 'Probability is how often we expect an event to happen. If something is impossible, its probability is 0%. If something is guaranteed, its probability is 100%. Most events live in between.\n\nThere are two ways to look at it. Flip the coin below a few times and watch the running tally: heads divided by the total number of flips. That is the observed (experimental) probability — what actually happened so far. It wobbles early on and drifts toward the true value the more you flip.',
      bodyAfterDemo: 'The theoretical probability instead comes from counting the equally likely outcomes, before you flip anything:\n\nP(event) = successful outcomes / total possible outcomes\n\nA fair coin has 2 equally likely sides, so P(heads) = 1/2 = 50% — and the observed share of heads settles near that as flips pile up.',
      demo: {
        demoType: 'coin-flip',
        target: 'Heads',
        variant: 'simple',
      },
    },
    {
      stepId: 'problem-coin-probability',
      type: 'problem',
      format: 'free-response',
      title: 'Expected percentage',
      description: 'Here is the same coin to experiment with. Flip it a few times and watch how the running share of heads behaves, then use that intuition to answer below.',
      question: 'Using the coin above: if you flip a fair coin 1,000 times, about **what share of the flips should you expect to be heads**? Enter a fraction, decimal, or percent.',
      demo: {
        demoType: 'coin-flip',
        target: 'Heads',
      },
      demoFirst: true,
      acceptedAnswer: '1/2',
      tolerance: 0.02,
      placeholder: 'e.g. 1/2, 0.5, or 50%',
      hints: [
        'Each flip is one of two equally likely outcomes.',
        'The number of flips changes how many trials you run, not the chance on each fair flip.',
        'Use successful outcomes divided by total possible outcomes: 1 heads side out of 2.',
      ],
      explanation: 'Heads is 1 successful outcome out of 2 possible outcomes, so the expected share is 1/2 = 50%. With 1,000 flips the result may not be exactly 500 heads, but it should usually be close.',
      incorrectFeedback: 'Use a hint if you\'re stuck!',
    },
    {
      stepId: 'problem-dice-probability',
      type: 'problem',
      format: 'multi-stage',
      title: 'From two choices to six',
      explore: {
        body: 'The coin had two equally likely outcomes. Now meet a wheel split into six equal slices labeled 1, 2, 3, 4, 5, and 6.\n\nSpin it below to see how it behaves. No slice is special, but landing on any one face should be less common than heads on a coin, because that face is only one slice out of six instead of one side out of two.\n\nWhen you are done experimenting, continue to the question.',
        continueLabel: 'Continue to the question',
      },
      question: 'Now answer both parts below.',
      demo: {
        demoType: 'dice-roll',
        target: '4',
      },
      stages: [
        {
          stageId: 'stage-single-spin',
          format: 'free-response',
          prompt: 'On a single spin of the fair six-face wheel, **what is the probability of landing on one specific face, like Face 4**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '1/6',
          tolerance: 0.02,
          placeholder: 'e.g. 1/6, 0.17, or 17%',
          hints: [
            'Count the faces on the wheel. How many equally likely faces are there in total?',
            'Only one face is the target. Use P = successful / total — one target face out of six.',
          ],
          explanation: 'One specific face is 1 of 6 equally likely faces, so P(Face 4) = 1/6 ≈ 16.7%.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-expected-count',
          format: 'free-response',
          prompt: 'Now you spin the wheel 600 times. **About how many of those spins should land on Face 4**? Enter a whole number.',
          acceptedAnswer: '100',
          tolerance: 1,
          placeholder: 'a whole number of spins',
          hints: [
            'You just found that each spin lands on Face 4 with probability 1/6.',
            'Expected count = probability × number of spins.',
            'Work out 1/6 of 600.',
          ],
          explanation: 'Expected successes = probability × trials = 1/6 × 600 = 100. So Face 4 should appear about 100 times.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-even-dice',
      type: 'problem',
      title: 'Expected vs. observed',
      description: 'Same wheel, a different kind of thinking: the last step computed numbers — this one asks you to judge what a short, real run actually tells you.',
      question: 'You found that Face 4 should land about 1 spin in 6, so 60 spins should give roughly 10. Spin the wheel above around 60 times and suppose Face 4 lands only 6 times — well short of 10. **Which interpretation of this gap is best**?',
      demo: {
        demoType: 'dice-roll',
        target: '4',
      },
      demoFirst: true,
      choices: [
        { label: 'It is impossible for a fair wheel to land on Face 4 only 6 times in 60 spins.', value: 'impossible' },
        { label: 'The wheel must be unfair or broken.', value: 'unfair' },
        { label: 'Face 4\'s true probability has permanently changed to 6/60.', value: 'changed' },
        { label: 'It is unlikely but not impossible — small samples wobble around 1/6, so spin many more times before judging.', value: 'wobble' },
      ],
      answer: 'wobble',
      explanation: 'Landing 6 times instead of 10 is unlikely, but far from impossible — rare is not the same as impossible. Observed frequencies wobble around the theoretical 1/6, and the wobble is larger for small samples. Spinning many more times pulls the observed rate back toward 1/6.',
      incorrectFeedback: 'Give it another try.',
    },
  ],
};

export const countingOutcomesLesson: Lesson = {
  lessonId: 'counting-outcomes',
  order: 2,
  contentVersion: 22,
  title: 'Counting Outcomes',
  summary: 'Learn how to count what can happen before you calculate probability.',
  tags: ['basic-probability', 'counting', 'outcomes'],
  estimatedMinutes: 10,
  masteryCriteria: {
    minFirstAttemptAccuracy: 0.8,
    minCompletedSteps: 4,
  },
  steps: [
    {
      stepId: 'problem-count-the-event',
      type: 'problem',
      format: 'multi-stage',
      title: 'Count before you calculate',
      explore: {
        body: 'Probability starts with a simple question: what outcomes are possible? For a fair die, the possible outcomes are 1, 2, 3, 4, 5, and 6.\n\nThe event is what you are watching for. "Roll a 6" is one event; "roll 5 or 6" is a different event. Counting outcomes means deciding which die sides belong to the event — the total possible stays at 6, only the successful count changes.\n\nSet the lab to the event "5 or 6" and watch how many sides light up before you continue.',
        continueLabel: 'Continue to the question',
      },
      question: 'Now answer both parts using the lab above.',
      demo: {
        demoType: 'outcome-count',
        target: 'high',
      },
      stages: [
        {
          stageId: 'stage-successful-count',
          format: 'free-response',
          prompt: 'For the event "5 or 6," **how many of the six die sides are successful outcomes**? Enter a whole number.',
          acceptedAnswer: '2',
          placeholder: 'a whole number of sides',
          hints: [
            'Successful outcomes are the sides that make the event happen.',
            'Only the highlighted sides count. Which sides are 5 or 6?',
          ],
          explanation: 'The successful sides are 5 and 6, so there are 2 successful outcomes out of 6 possible sides.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-event-probability',
          format: 'free-response',
          prompt: 'Using that count, **what is the probability of rolling a 5 or 6**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '2/6',
          tolerance: 0.02,
          placeholder: 'e.g. 2/6, 1/3, or 33%',
          hints: [
            'Use P = successful outcomes / total possible outcomes.',
            'You found 2 successful sides, and there are 6 sides in total.',
          ],
          explanation: 'P(5 or 6) = 2/6 = 1/3 ≈ 33%. Two successful sides out of six possible sides.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-as-likely-as-not',
      type: 'problem',
      format: 'slider',
      title: 'As likely as not',
      description: 'Drag the slider to choose how many of the six die faces win. The die and the probability update live as you move it.',
      question: 'Drag the slider until the event is **as likely as not** — a 50/50 chance. **How many winning faces is that?**',
      demo: {
        demoType: 'probability-slider',
      },
      sliderMin: 0,
      sliderMax: 6,
      sliderStep: 1,
      acceptedAnswer: '3',
      hints: [
        '"As likely as not" means the probability is exactly 1/2.',
        'You want the winning faces to be half of all six faces.',
        'Half of 6 is 3, so 3 winning faces give 3/6 = 1/2.',
      ],
      explanation: 'With 3 of the 6 faces winning, P = 3/6 = 1/2 = 50% — exactly as likely as not. Fewer winning faces drop below 50%, more push above it.',
      incorrectFeedback: 'Not quite — move the slider until the probability reads 1/2 (50%).',
    },
    {
      stepId: 'problem-complement-count',
      type: 'problem',
      format: 'multi-stage',
      title: 'Events have opposites',
      explore: {
        body: 'Every event E has an opposite, written "not E" — its complement. A roll satisfies E or "not E" but never both, so their probabilities always add to 1: P(not E) = 1 − P(E).',
        continueLabel: 'Continue to the question',
      },
      question: 'Now answer both parts using the lab above, with the event set to "not 6".',
      demo: {
        demoType: 'outcome-count',
        target: 'not-6',
      },
      stages: [
        {
          stageId: 'stage-unsuccessful-count',
          format: 'free-response',
          prompt: 'The event "not 6" is the opposite of rolling a 6. **How many of the six die sides satisfy "not 6"**? Enter a whole number.',
          acceptedAnswer: '5',
          placeholder: 'a whole number of sides',
          hints: [
            '"not 6" covers every side except the single 6.',
            'Take the 6 total sides and remove the 1 side that IS a 6.',
          ],
          explanation: 'Five sides (1, 2, 3, 4, 5) are not a 6, so "not 6" has 5 successful outcomes out of 6 — exactly the sides that "6" leaves out.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-complement-probability',
          format: 'free-response',
          prompt: 'So **what is the probability of "not 6"**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '5/6',
          tolerance: 0.02,
          placeholder: 'e.g. 5/6, 0.83, or 83%',
          hints: [
            'Use the satisfying sides over the total: 5 / 6.',
            'Or use the opposite: P(not 6) = 1 − P(6) = 1 − 1/6.',
            'Check it: P(6) + P(not 6) = 1/6 + 5/6 = 1.',
          ],
          explanation: 'P(not 6) = 5/6 ≈ 83%. An event and its complement always add to 1: 1/6 + 5/6 = 1, so P(not 6) = 1 − P(6). The same pattern gives P(not 5 or 6) = 4/6 and P(not even) = 3/6.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-expected-frequency',
      type: 'problem',
      format: 'free-response',
      title: 'Expected vs. observed',
      description: 'Predict the long-run count for one event.',
      question: 'Roll the die many times below. Out of 120 rolls, **about how many do you expect to be even**? Enter a whole number.',
      demo: {
        demoType: 'dice-distribution',
        target: 'even',
      },
      demoFirst: true,
      acceptedAnswer: '60',
      tolerance: 6,
      unit: 'rolls',
      placeholder: 'a whole number of rolls',
      hints: [
        'Even numbers are 2, 4, and 6, so P(even) = 3/6 = 1/2.',
        'Expected count = probability × number of rolls.',
        'Work out 1/2 of 120.',
      ],
      explanation: 'P(even) = 3/6 = 1/2, so the expected count is 1/2 × 120 = 60. Your observed count will wobble around 60.',
      incorrectFeedback: 'Use a hint if you\'re stuck!',
    },
    {
      stepId: 'problem-even-not-six',
      type: 'problem',
      format: 'free-response',
      title: 'Put the pieces together',
      description: 'Same distribution lab as the last step, but now combine two ideas from this lesson — counting an event and excluding part of it with a complement — before scaling up to a long run.',
      question: 'You roll the fair die 120 times. **About how many rolls do you expect to be even but NOT a 6**? Enter a whole number.',
      demo: {
        demoType: 'dice-distribution',
        target: 'even',
      },
      demoFirst: true,
      acceptedAnswer: '40',
      tolerance: 5,
      unit: 'rolls',
      placeholder: 'a whole number of rolls',
      hints: [
        'Start by listing the even sides: 2, 4, and 6 — that is 3 of the 6 sides.',
        'You want even but NOT a 6, so drop the 6. That leaves sides 2 and 4 — 2 of the 6 sides.',
        'P(even but not 6) = 2/6 = 1/3, and the expected count is probability × rolls = 1/3 × 120.',
      ],
      explanation: 'The even sides are 2, 4, and 6, but "not a 6" removes the 6, leaving just 2 and 4 — so 2 of the 6 sides satisfy "even but not 6." That makes P = 2/6 = 1/3, and the expected count in 120 rolls is 1/3 × 120 = 40. Your observed count will wobble around 40.',
      incorrectFeedback: 'Use a hint if you\'re stuck!',
    },
  ],
};

export const compoundEventsLesson: Lesson = {
  lessonId: 'compound-events',
  order: 3,
  contentVersion: 15,
  title: 'Compound Events',
  summary: 'See how two-step events work, then separate "and" from "or".',
  tags: ['compound-events', 'and-or', 'two-step'],
  estimatedMinutes: 12,
  masteryCriteria: {
    minFirstAttemptAccuracy: 0.8,
    minCompletedSteps: 3,
  },
  steps: [
    {
      stepId: 'problem-count-pairs',
      type: 'problem',
      format: 'multi-stage',
      title: 'When two things happen',
      explore: {
        body: 'Some probabilities ask about one event; others ask about a pair of events. "Flip heads and then roll a 6" is stricter than either event alone, because both pieces have to happen — so a two-step event is less likely. A coin has 2 results and a die has 6 faces, so together they make 2 x 6 = 12 equally likely pairs (H1 through T6), and the event "heads and 6" highlights the pairs that win.',
        continueLabel: 'Continue to the question',
      },
      question: 'Now answer both parts using the grid above.',
      demo: {
        demoType: 'compound-events',
        target: 'H6',
      },
      stages: [
        {
          stageId: 'stage-count-pairs',
          format: 'free-response',
          prompt: '**How many of the 12 coin–die pairs satisfy "heads and 6"**? Enter a whole number.',
          acceptedAnswer: '1',
          placeholder: 'a whole number of pairs',
          hints: [
            'A winning pair needs heads on the coin AND a 6 on the die.',
            'Scan the grid: only the highlighted cell counts.',
          ],
          explanation: 'Only H6 satisfies both requirements, so there is 1 matching pair out of 12.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-pair-probability',
          format: 'free-response',
          prompt: 'So **what is the probability of flipping heads and rolling a 6**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '1/12',
          tolerance: 0.02,
          placeholder: 'e.g. 1/12, 0.08, or 8%',
          hints: [
            'Use P = successful pairs / total pairs.',
            'There is 1 winning pair out of 12 possible pairs.',
          ],
          explanation: 'P(heads and 6) = 1/12 ≈ 8%. One winning pair out of 12 equally likely pairs.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-tails-over-four',
      type: 'problem',
      format: 'multi-stage',
      title: 'The "and" rule: multiply',
      explore: {
        body: 'An "and" event needs both pieces to happen. When the two steps are independent, you multiply their probabilities: P(heads and 6) = P(heads) × P(roll a 6) = 1/2 × 1/6 = 1/12. (An "or" event, where the two results cannot both happen, adds instead.) The tree below makes this visible: multiply the chances along the highlighted path to get the joint probability.',
        continueLabel: 'Continue to the question',
      },
      question: 'Now work out P(tails and over 4) in two steps using the area model above.',
      demo: {
        demoType: 'and-multiply',
        target: 'T-high',
      },
      stages: [
        {
          stageId: 'stage-count-high-faces',
          format: 'free-response',
          prompt: 'A die has faces 1–6. **How many of them count as "over 4"**? Enter a whole number.',
          acceptedAnswer: '2',
          placeholder: 'a whole number of faces',
          hints: [
            '"Over 4" means strictly greater than 4 — not 4 itself.',
            'Only 5 and 6 clear that bar.',
          ],
          explanation: 'Exactly 2 faces are over 4 (the 5 and the 6), so P(over 4) = 2/6.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-tails-high-probability',
          format: 'free-response',
          prompt: 'P(tails) = 1/2 and P(over 4) = 2/6. Multiply for the "and" event: **what is P(tails and over 4)**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '2/12',
          tolerance: 0.02,
          placeholder: 'e.g. 2/12, 1/6, or 17%',
          hints: [
            'For an "and" event with two independent steps, multiply the two probabilities.',
            '1/2 × 2/6 is the shaded area of the square.',
            '1/2 × 2/6 = 2/12, which reduces to 1/6.',
          ],
          explanation: 'P(tails and over 4) = 1/2 × 2/6 = 2/12 = 1/6 ≈ 17%. That shaded rectangle is smaller than either side alone — "and" narrows the event.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-compound-wrap',
      type: 'problem',
      title: 'The hidden overlap',
      description: 'Set the lab to "Heads or 6" and count the lit cells for yourself before you answer — the number may surprise you.',
      question: 'Here is a tempting shortcut: P(heads) = 6/12 and P(a 6) = 2/12, so P(heads or 6) "should" be 6/12 + 2/12 = 8/12. But the grid lights up only 7 pairs, so the real answer is 7/12. **What went wrong with the 8/12 reasoning**?',
      demo: {
        demoType: 'compound-events',
        target: 'heads-or-6',
      },
      demoFirst: true,
      choices: [
        { label: 'The pair H6 is heads AND a 6, so 6/12 + 2/12 counts it twice — subtract that one shared pair to get 7/12.', value: 'overlap' },
        { label: 'Heads and a 6 can never land on the same trial, so one pair is impossible and drops out.', value: 'impossible' },
        { label: 'For any "or" event you subtract the two probabilities instead of adding them.', value: 'subtract-rule' },
        { label: '8/12 is actually right; the grid is just missing one of the winning pairs.', value: 'grid-wrong' },
      ],
      answer: 'overlap',
      explanation: 'P(heads or 6) = P(heads) + P(6) − P(heads and 6) = 6/12 + 2/12 − 1/12 = 7/12. The pair H6 sits in both groups, so plain addition counts it twice; subtracting the single overlap fixes the double count. (When two events truly can\'t overlap, that shared part is 0 and you simply add — the focus of the next lesson.)',
      incorrectFeedback: 'Give it another try.',
    },
  ],
};

export const dependentEventsLesson: Lesson = {
  lessonId: 'dependent-events',
  order: 4,
  contentVersion: 18,
  title: 'Conditional Probability',
  summary: 'Learn how new information changes which group you should count.',
  tags: ['conditional', 'given', 'evidence'],
  estimatedMinutes: 12,
  masteryCriteria: {
    minFirstAttemptAccuracy: 0.8,
    // Lesson trimmed from 5 to 4 steps (formula concept folded into the
    // calculation step); keep a one-step buffer so mastery stays reachable.
    minCompletedSteps: 3,
  },
  steps: [
    {
      stepId: 'problem-condition-on-cloudy',
      type: 'problem',
      format: 'free-response',
      title: 'New information changes the group',
      explore: {
        body: 'Suppose you ask, "What is the probability that it is raining?" With no other clues you look across every day on record. Now I tell you one new fact: "It is cloudy." That fact does not change the weather — it changes which days you count, so you focus only on the cloudy ones. That is conditional probability: how a probability shifts once you are given new information. Condition on cloudy in the lab and watch the group you count shrink.',
        continueLabel: 'Continue to the question',
      },
      question: 'Once you condition on cloudy, **how many days are in the group you count (the denominator)**? Enter a whole number.',
      demo: {
        demoType: 'weather-conditional',
      },
      demoFirst: true,
      acceptedAnswer: '40',
      placeholder: 'a whole number of days',
      hints: [
        'Conditioning on cloudy throws away the clear days.',
        'How many of the 100 days are cloudy?',
      ],
      explanation: 'Only the 40 cloudy days stay in the group, so the denominator is 40.',
      incorrectFeedback: 'Use a hint if you\'re stuck!',
    },
    {
      stepId: 'problem-conditional-formula',
      type: 'problem',
      format: 'multi-stage',
      title: 'Use the conditional formula',
      description: 'Capture conditioning as a formula, then apply it to a fresh set of days.',
      explore: {
        body: 'The bar means "given," so P(A | B) is the probability of A once you know B. Conditioning puts that group in the denominator:\n\nP(A | B) = P(A and B) / P(B)\n\nThe numerator counts the cases that satisfy both A and B, while the denominator is the whole conditioning group B. Keep the formula in view as you work the question below.',
        continueLabel: 'Continue to the question',
      },
      question: 'In a new set of 100 days, 50 are cloudy and 20 of those are both cloudy and rainy.',
      demo: {
        demoType: 'weather-conditional',
        target: 'formula',
      },
      stages: [
        {
          stageId: 'stage-apply-formula',
          format: 'free-response',
          prompt: 'Using the formula, **what is P(rain | cloudy)**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '20/50',
          tolerance: 0.02,
          placeholder: 'e.g. 20/50, 2/5, or 40%',
          hints: [
            'Given cloudy means the cloudy days are the whole group.',
            'The denominator is the 50 cloudy days, not all 100.',
            'Put the 20 rainy-and-cloudy days over the 50 cloudy days.',
          ],
          explanation: 'P(rain | cloudy) = 20/50 = 40%. The 50 cloudy days are the conditioning group B (the denominator), and 20 of them are also rainy (the numerator).',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-draw-dependence',
      type: 'problem',
      format: 'multi-stage',
      title: 'When the group changes as you go',
      explore: {
        body: 'Conditioning is not always about being handed a fact — sometimes your own actions change the group. Each time you draw a marble and keep it, the bag that remains is different, so the next draw is conditioned on what is left.',
        continueLabel: 'Continue to the question',
      },
      question: 'Now answer both parts using the marble lab above.',
      demo: {
        demoType: 'draw-dependence',
        target: 'without',
      },
      stages: [
        {
          stageId: 'stage-first-draw',
          format: 'free-response',
          prompt: 'On the very first draw, **what is the probability of teal**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '3/5',
          tolerance: 0.02,
          placeholder: 'e.g. 3/5, 0.6, or 60%',
          hints: [
            'There are 3 teal marbles.',
            'The bag holds 5 marbles in total at the start.',
          ],
          explanation: 'P(teal) = 3/5 = 60% on the first draw: 3 teal out of 5 marbles.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-second-draw',
          format: 'free-response',
          prompt: 'Suppose the first marble was teal and you keep it. Now 2 teal and 2 orange remain. **What is the probability the next draw is teal**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '2/4',
          tolerance: 0.02,
          placeholder: 'e.g. 2/4, 1/2, or 50%',
          hints: [
            'Removing a teal marble leaves 2 teal.',
            'Only 4 marbles remain now.',
          ],
          explanation: 'P(teal next) = 2/4 = 50%. Keeping the first teal marble changed the group, so the probability dropped from 3/5 to 2/4.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-conditional-wrap',
      type: 'problem',
      title: 'What does "given" do?',
      description: 'Same marble bag as the last step — new question: experiment with and without replacing, then pick the best explanation of why "given" changes the odds.',
      question: 'You draw one marble from the bag and keep it. **Why does knowing the first marble was teal change the probability that the next draw is teal**?',
      demo: {
        demoType: 'draw-dependence',
        target: 'without',
      },
      demoFirst: true,
      choices: [
        { label: 'Because removing that marble leaves a different mix, so you only consider what is left.', value: 'fewer-left' },
        { label: 'Because the bag always holds the same mix no matter what you draw.', value: 'same-mix' },
        { label: 'Because drawing teal first makes teal impossible next.', value: 'impossible' },
        { label: 'Because every color is equally likely no matter what.', value: 'equal-always' },
      ],
      answer: 'fewer-left',
      explanation: 'Once a teal marble is removed, fewer teal marbles and fewer marbles overall remain, so you compute the next probability from only what is left. New information changes the group you count.',
      incorrectFeedback: 'Give it another try.',
    },
  ],
};

export const strategyFairnessLesson: Lesson = {
  lessonId: 'mutually-exclusive-events',
  order: 5,
  contentVersion: 14,
  title: 'Mutually Exclusive Events',
  summary: 'Learn when two events cannot happen together, and when adding probabilities double-counts.',
  tags: ['mutually-exclusive', 'or', 'overlap'],
  estimatedMinutes: 12,
  masteryCriteria: {
    minFirstAttemptAccuracy: 0.8,
    // Lesson trimmed from 5 to 4 steps (overlap concept folded into the add
    // step); keep a one-step buffer so mastery stays reachable.
    minCompletedSteps: 3,
  },
  steps: [
    {
      stepId: 'problem-find-overlap',
      type: 'problem',
      format: 'multi-stage',
      title: 'Can both labels fit?',
      explore: {
        body: 'Some events cannot happen at the same time. On one die roll, the result cannot be odd and even at once — those events are mutually exclusive, because they share no outcomes (the overlap is 0).\n\nBut a result can be even and greater than 4, because 6 fits both labels. When two events share a side, that side belongs to both — and adding the events without thinking counts the shared side twice.\n\nSet the lab to "Even vs greater than 4" before you continue.',
        continueLabel: 'Continue to the question',
      },
      question: 'Now answer both parts using the lab above.',
      demo: {
        demoType: 'mutually-exclusive',
        target: 'even-high',
        hideTrials: true,
      },
      stages: [
        {
          stageId: 'stage-overlap-count',
          format: 'free-response',
          prompt: 'For "Even vs greater than 4," **how many die sides are in the overlap (fit both events)**? Enter a whole number.',
          acceptedAnswer: '1',
          placeholder: 'a whole number of sides',
          hints: [
            'Even sides are 2, 4, 6. Sides greater than 4 are 5, 6.',
            'Which single side appears in both lists?',
          ],
          explanation: 'Only side 6 is both even and greater than 4, so the overlap is 1 side.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-union-probability',
          format: 'free-response',
          prompt: '**What is P(A or B) — the probability the roll fits at least one of the two events**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '4/6',
          tolerance: 0.02,
          placeholder: 'e.g. 4/6, 2/3, or 67%',
          hints: [
            'List every side in either event: 2, 4, 5, 6.',
            'That is 4 distinct sides out of 6.',
          ],
          explanation: 'The union is 2, 4, 5, and 6 — four sides — so P(A or B) = 4/6 = 2/3. Side 6 is counted once, not twice.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-add-exclusive',
      type: 'problem',
      format: 'multi-stage',
      title: 'Add without double-counting',
      // Demo renders above the explore lead-in so this folded step opens with the
      // interactive die lab instead of a wall of prose.
      demoFirst: true,
      description: 'For "A or B," count every outcome that fits at least one event.',
      explore: {
        body: 'When two events share no sides you can add their probabilities directly, P(A or B) = P(A) + P(B). When they do overlap, the shared outcomes get counted twice — once inside P(A) and again inside P(B) — so you subtract the overlap once to correct it: P(A or B) = P(A) + P(B) - P(A and B). Compare a non-overlapping pair in the lab below, then answer the two parts.',
        continueLabel: 'Continue to the question',
      },
      question: 'On one fair die, Event A is "less than 4" (sides 1, 2, 3) and Event B is "greater than 4" (sides 5, 6). These events share no sides.',
      demo: {
        demoType: 'mutually-exclusive',
        target: 'static',
      },
      stages: [
        {
          stageId: 'stage-union-no-overlap',
          format: 'free-response',
          prompt: '**How many distinct die sides are in "A or B"**? Enter a whole number.',
          acceptedAnswer: '5',
          placeholder: 'a whole number of sides',
          hints: [
            'A = 1, 2, 3 (three sides); B = 5, 6 (two sides).',
            'No side is shared, so just count them all: 3 + 2.',
          ],
          explanation: 'A covers 1, 2, 3 and B covers 5, 6 with no overlap, so "A or B" spans 5 distinct sides — only side 4 is left out.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-add-exclusive',
          format: 'free-response',
          prompt: 'So **what is P(A or B)**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '5/6',
          tolerance: 0.02,
          placeholder: 'e.g. 5/6, 0.83, or 83%',
          hints: [
            'Put the 5 distinct sides over the 6 total sides.',
            'With no overlap, P(A or B) = 3/6 + 2/6.',
          ],
          explanation: 'P(A or B) = 3/6 + 2/6 = 5/6 ≈ 83%. No side is shared, so adding does not double-count anything.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-double-count',
      type: 'problem',
      format: 'multi-stage',
      title: 'Catch the double-count',
      explore: {
        body: 'Adding the size of A to the size of B counts every member they share twice, so the sum overshoots the true number of things in "A or B" — subtracting the overlap once fixes it.',
        continueLabel: 'Continue to the question',
      },
      question: 'Now answer both parts using the tally above.',
      demo: {
        demoType: 'double-count-tally',
      },
      stages: [
        {
          stageId: 'stage-naive-sum',
          format: 'free-response',
          prompt: '4 guests wear a hat and 4 guests hold a balloon. **What does the naive sum |A| + |B| give**? Enter a whole number.',
          acceptedAnswer: '8',
          placeholder: 'a whole number of guests',
          hints: [
            'Just add the two counts together.',
            '4 hats plus 4 balloons.',
          ],
          explanation: '|A| + |B| = 4 + 4 = 8. But that total counts the both-guests twice.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-true-union',
          format: 'free-response',
          prompt: 'Two guests wear a hat AND hold a balloon, so they were counted twice. **What is the true count of guests in "A or B"**? Enter a whole number.',
          acceptedAnswer: '6',
          placeholder: 'a whole number of guests',
          hints: [
            'Subtract the overlap once from the naive sum.',
            '8 minus the 2 double-counted guests.',
          ],
          explanation: 'True count = |A| + |B| − overlap = 4 + 4 − 2 = 6. That matches P(A or B) = P(A) + P(B) − P(A and B).',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-tune-the-overlap',
      type: 'problem',
      format: 'slider',
      title: 'Tune the overlap',
      description: 'Two events on a fair die, each covering 3 of the 6 sides. Drag the slider to change how many sides they share. The Venn diagram and P(A or B) update live as you drag.',
      question: 'Keep both events at 3 sides each and drag the overlap until **P(A or B) = 2/3**. **How many shared sides does that take?**',
      demo: {
        demoType: 'overlap-slider',
      },
      sliderMin: 0,
      sliderMax: 3,
      sliderStep: 1,
      acceptedAnswer: '2',
      hints: [
        'P(A or B) = P(A) + P(B) − P(A and B) = 3/6 + 3/6 − overlap/6.',
        'You need (6 − overlap)/6 to equal 2/3, so 6 − overlap must be 4.',
        'Sharing 2 sides gives a union of 4 sides: 4/6 = 2/3.',
      ],
      explanation: 'With 2 shared sides, the union is 3 + 3 − 2 = 4 sides, so P(A or B) = 4/6 = 2/3. Each extra shared side is double-counted in P(A) + P(B), so subtracting it once shrinks the union.',
      incorrectFeedback: 'Not quite — drag the overlap until P(A or B) reads 2/3 (4 of 6 sides).',
    },
    {
      stepId: 'problem-mutually-exclusive-wrap',
      type: 'problem',
      title: 'Use the full rule',
      description: 'Set the lab to "Even vs greater than 4" before you choose.',
      question: 'On one fair die, A = even numbers and B = numbers greater than 4. **Why is P(A or B) not 5/6**?',
      demo: {
        demoType: 'mutually-exclusive',
        target: 'even-high',
        hideTrials: true,
      },
      demoFirst: true,
      choices: [
        { label: 'Because side 6 is counted in both A and B.', value: 'double-count-six' },
        { label: 'Because even numbers are impossible.', value: 'even-impossible' },
        { label: 'Because greater than 4 has no outcomes.', value: 'no-high' },
        { label: 'Because "or" always means exactly one event.', value: 'exactly-one' },
      ],
      answer: 'double-count-six',
      explanation: 'A has 2, 4, 6 and B has 5, 6. Adding 3/6 + 2/6 counts side 6 twice. The real union is 2, 4, 5, 6 = 4/6.',
      incorrectFeedback: 'Give it another try.',
    },
  ],
};

export const allLessons: Lesson[] = [
  introBasicProbabilityLesson,
  countingOutcomesLesson,
  compoundEventsLesson,
  dependentEventsLesson,
  strategyFairnessLesson,
];
