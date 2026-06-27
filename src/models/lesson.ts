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
  | 'overlap-slider'
  | 'expected-value-spinner'
  | 'arcade-rings'
  | 'bayes-frequency'
  | 'bayes-frequency-lab'
  | 'bayes-screening-slider';

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

export interface PretrievalMoment {
  /** A low-stakes prediction or first attempt shown before the explanation/demo resolves it. */
  prompt: string;
}

export interface ConceptStep extends BaseStep {
  type: 'concept';
  body: string;
  pretrieval?: PretrievalMoment;
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
 * - `sort`: the learner drags/places each item into one of several labeled
 *   buckets; the placement IS the answer, graded against `sortSolution`.
 * - `order`: the learner arranges items into a sequence (e.g. least → most
 *   likely); the arrangement IS the answer, graded against `orderSolution`.
 */
export type ProblemFormat =
  | 'multiple-choice'
  | 'free-response'
  | 'multi-stage'
  | 'slider'
  | 'sort'
  | 'order';

/** A draggable/placeable item used by the `sort` and `order` interactions. */
export interface InteractiveItem {
  id: string;
  label: string;
}

/** A labeled drop target for a `sort` interaction. */
export interface SortBucket {
  id: string;
  label: string;
  /** Optional one-line helper shown under the bucket label. */
  hint?: string;
}

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
  /** Optional low-stakes prediction before the scored question or reveal. */
  pretrieval?: PretrievalMoment;
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
  // sort fields: the learner drops each item into a bucket. The placement (a map
  // of itemId → bucketId) is graded against `sortSolution`. Buckets are shown in
  // authored order; items start in an unplaced tray.
  sortItems?: InteractiveItem[];
  sortBuckets?: SortBucket[];
  /** Correct bucket id for each item id. Every item must be placed correctly. */
  sortSolution?: Record<string, string>;
  // order fields: the learner arranges items into a sequence. The ordered list
  // of item ids is graded against `orderSolution`.
  orderItems?: InteractiveItem[];
  /** Correct order of item ids (index 0 = the `orderStartLabel` end). */
  orderSolution?: string[];
  /** Label for the start (top) of the ordering, e.g. "Least likely". */
  orderStartLabel?: string;
  /** Label for the end (bottom) of the ordering, e.g. "Most likely". */
  orderEndLabel?: string;
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
  contentVersion: 27,
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
      pretrieval: {
        prompt: 'Before you flip: what share of many fair-coin flips do you expect to be heads?',
      },
      body: 'Probability is how often we expect an event to happen — 0% if impossible, 100% if certain, and usually somewhere between. Flip the coin a few times and watch the running share of heads: that observed value wobbles at first, then settles toward the true chance as flips pile up.',
      bodyAfterDemo: 'You can also predict it before flipping, by counting equally likely outcomes:\n\nP(event) = successful outcomes / total possible outcomes\n\nA fair coin has 2 equal sides, so P(heads) = 1/2 = 50%.',
      demo: {
        demoType: 'coin-flip',
        target: 'Heads',
        variant: 'simple',
      },
    },
    {
      stepId: 'problem-coin-probability',
      type: 'problem',
      format: 'order',
      title: 'Line them up by likelihood',
      description: 'Probability runs from 0% (impossible) to 100% (certain). Arrange these everyday events from least to most likely.',
      orderItems: [
        { id: 'impossible', label: 'Roll a 7 on a six-face die' },
        { id: 'lightning', label: 'Being struck by lightning in your lifetime' },
        { id: 'weekend', label: 'A randomly chosen day of the week is a weekend' },
        { id: 'sunrise', label: 'The sun rises tomorrow morning' },
      ],
      orderSolution: ['impossible', 'lightning', 'weekend', 'sunrise'],
      orderStartLabel: 'Least likely',
      orderEndLabel: 'Most likely',
      question: 'Drag the events so the **least likely is on top and the most likely is on the bottom**.',
      hints: [
        'A six-face die has no 7, so that can never happen — it sits at 0%.',
        'Being struck by lightning in your lifetime is very rare — far below 1%.',
        'A weekend is 2 of the 7 days (about 29%); the sun rising tomorrow is all but certain (~100%).',
      ],
      explanation: 'Rolling a 7 is impossible (0%). Being struck by lightning in your lifetime is very rare (well under 1%). A weekend is 2 of 7 days (about 29%). The sun rising tomorrow is nearly certain (~100%). Probability lines events up from 0% to 100%.',
      incorrectFeedback: 'Estimate each event\'s chance from 0% up to 100%, then order them smallest to largest.',
    },
    {
      stepId: 'problem-dice-probability',
      type: 'problem',
      format: 'multi-stage',
      title: 'From two choices to six',
      pretrieval: {
        prompt: 'Before the formula: if one wheel face is the target, what should you count first?',
      },
      explore: {
        body: 'The coin had 2 equally likely outcomes; this wheel has 6 equal slices (1–6). So landing on any one face is rarer than heads — one slice in six, not one side in two. Spin it, then continue.',
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
      description: 'Same wheel — now judge what a short, real run actually tells you.',
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
  contentVersion: 25,
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
      pretrieval: {
        prompt: 'Before the lab highlights anything: which sides do you think count for "5 or 6"?',
      },
      explore: {
        body: 'Counting outcomes just means deciding which sides belong to the event — the total stays 6, only the successful count changes. An event is what you are watching for: "roll a 6" and "roll 5 or 6" are different events. Set the lab to "5 or 6" and watch which sides light up.',
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
      pretrieval: {
        prompt: 'Before using the rule: is "not 6" easier to count directly or by subtracting the 6?',
      },
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
      format: 'sort',
      title: 'Build the favorable outcomes',
      description: 'Combine two ideas from this lesson — counting an event and excluding part of it with a complement. Drop each die face into the box where it belongs to build the event "even, but not a 6."',
      sortItems: [
        { id: '1', label: '1' },
        { id: '2', label: '2' },
        { id: '3', label: '3' },
        { id: '4', label: '4' },
        { id: '5', label: '5' },
        { id: '6', label: '6' },
      ],
      sortBuckets: [
        { id: 'fav', label: 'Even, but NOT a 6', hint: 'Faces that win the event' },
        { id: 'other', label: 'Everything else', hint: 'Faces that do not' },
      ],
      sortSolution: { '2': 'fav', '4': 'fav', '1': 'other', '3': 'other', '5': 'other', '6': 'other' },
      question: 'Drag each face into **"Even, but NOT a 6"** or **"Everything else."**',
      hints: [
        'Even faces are 2, 4, and 6 — that is 3 of the 6 faces.',
        'The event also excludes the 6, so drop it. That leaves 2 and 4 as favorable.',
        'Only 2 and 4 are even and not a 6; every other face goes in "Everything else."',
      ],
      explanation: 'Even faces are 2, 4, and 6, but "not a 6" removes the 6 — leaving 2 and 4. So 2 of the 6 faces are favorable, which means P(even but not 6) = 2/6 = 1/3. Over many rolls, about a third land here.',
      incorrectFeedback: 'Even faces are 2, 4, and 6 — but the event also rules one of them out. Re-check which faces are even AND not a 6.',
    },
  ],
};

export const compoundEventsLesson: Lesson = {
  lessonId: 'compound-events',
  order: 3,
  contentVersion: 18,
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
      pretrieval: {
        prompt: 'Before the grid: does "heads and 6" need one thing to happen, or both?',
      },
      explore: {
        body: 'A compound event combines two or more simple events into a single outcome you care about. "Flip heads and roll a 6" needs both pieces to happen, so it is stricter than either alone. A coin (2 results) and a die (6 faces) make 2 × 6 = 12 equally likely pairs (H1 through T6); the event "heads and 6" highlights the pairs that win.',
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
      format: 'order',
      title: 'Which is rarer, "and" or "or"?',
      description: 'An "and" event needs both pieces, so it is stricter and rarer; an "or" event needs just one, so it is more forgiving. Rank these by how likely each is.',
      demo: {
        demoType: 'and-multiply',
        target: 'T-high',
      },
      orderItems: [
        { id: 'and6', label: 'Heads AND roll a 6' },
        { id: 'tover4', label: 'Tails AND roll over 4 (a 5 or 6)' },
        { id: 'or6', label: 'Heads OR roll a 6' },
      ],
      orderSolution: ['and6', 'tover4', 'or6'],
      orderStartLabel: 'Least likely',
      orderEndLabel: 'Most likely',
      question: 'Drag the events from **least likely (top) to most likely (bottom)**.',
      hints: [
        '"Heads and 6" wins on just 1 of the 12 coin–die pairs.',
        '"Tails and over 4" wins on 2 pairs (T5 and T6); "and" events stay small.',
        '"Heads or 6" only needs one piece, so it wins on many more pairs — 7 of 12.',
      ],
      explanation: '"Heads and 6" wins on only 1 of 12 pairs (1/12). "Tails and over 4" wins on 2 (2/12 = 1/6). "Heads or 6" wins on 7 (7/12) — "or" is far more forgiving than "and." (For independent "and" events you can also just multiply: 1/2 × 1/6 = 1/12.)',
      incorrectFeedback: 'Remember: "and" needs both pieces (rarer), while "or" needs just one (more likely). Count how many pairs win each.',
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
  contentVersion: 21,
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
      format: 'sort',
      title: 'New information changes the group',
      description: 'Being told "it is cloudy" does not change the weather — it changes which days you count. Sort each kind of day into the group you keep or the days you set aside.',
      demo: {
        demoType: 'weather-conditional',
      },
      demoFirst: true,
      sortItems: [
        { id: 'cloudy-rainy', label: 'Cloudy & rainy days' },
        { id: 'cloudy-dry', label: 'Cloudy & dry days' },
        { id: 'clear-rainy', label: 'Clear & rainy days' },
        { id: 'clear-dry', label: 'Clear & dry days' },
      ],
      sortBuckets: [
        { id: 'count', label: 'Count these', hint: 'The cloudy days — your new denominator' },
        { id: 'ignore', label: 'Set aside', hint: 'Days that are not cloudy' },
      ],
      sortSolution: {
        'cloudy-rainy': 'count',
        'cloudy-dry': 'count',
        'clear-rainy': 'ignore',
        'clear-dry': 'ignore',
      },
      question: 'Given that it is **cloudy**, drag each kind of day into the group you count or the days you set aside.',
      hints: [
        'Conditioning on cloudy keeps only the cloudy days — rainy or dry.',
        'A day being rainy or dry does not matter here; only whether it is cloudy.',
        'Both cloudy groups are counted; both clear groups are set aside.',
      ],
      explanation: 'Conditioning on cloudy keeps every cloudy day — whether rainy or dry — and sets aside the clear ones. Those cloudy days become the new denominator: the group you measure rain against.',
      incorrectFeedback: 'You are told it is cloudy, so keep the cloudy days and set aside the rest. Rain or no rain does not decide which days count here.',
    },
    {
      stepId: 'problem-conditional-formula',
      type: 'problem',
      format: 'multi-stage',
      demoFirst: true,
      title: 'Use the conditional formula',
      description: 'Capture conditioning as a formula, then apply it to a fresh set of days.',
      pretrieval: {
        prompt: 'Before the formula: if you know it is cloudy, should all days stay in the denominator?',
      },
      explore: {
        body: 'The bar means "given": P(A | B) is the chance of A once you know B. Conditioning makes B the new denominator:\n\nP(A | B) = P(A and B) / P(B)',
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
      description: 'Same marble bag — now pick the best explanation of why "given" changes the odds.',
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
  contentVersion: 18,
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
      pretrieval: {
        prompt: 'Before counting: can one die side be even and greater than 4 at the same time?',
      },
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

export const expectedValueLesson: Lesson = {
  lessonId: 'expected-value',
  order: 6,
  contentVersion: 5,
  title: 'Expected Value',
  summary: 'Find the long-run average payoff of a chance game, and learn what makes a game fair.',
  tags: ['expected-value', 'average', 'fairness'],
  estimatedMinutes: 13,
  masteryCriteria: {
    minFirstAttemptAccuracy: 0.8,
    minCompletedSteps: 4,
  },
  steps: [
    {
      stepId: 'concept-what-is-expected-value',
      type: 'concept',
      title: 'The long-run average payoff',
      demoFirst: true,
      pretrieval: {
        prompt: 'Before many spins: what average payoff do you think this spinner will settle near?',
      },
      body: 'Now each outcome carries a payoff: the spinner above has four equal wedges, and landing on one pays you that many points. Spin once and you cannot predict the result.',
      bodyAfterDemo: 'But run many spins and the running average payoff settles toward one fixed number, no matter how the early spins wobble. That number is the expected value, E[X] — the average payoff per spin over the long run.',
      demo: {
        demoType: 'expected-value-spinner',
        target: 'prize',
      },
    },
    {
      stepId: 'problem-compute-expected-value',
      type: 'problem',
      format: 'multi-stage',
      title: 'Compute E[X]',
      explore: {
        body: 'The prize spinner\'s four equal wedges pay 0, 2, 4, and 6 points — each equally likely. Spin a few times and watch the observed average creep toward the expected value, then compute it yourself.',
        continueLabel: 'Continue to the question',
      },
      question: 'Now find the expected value in two steps using the spinner above.',
      demo: {
        demoType: 'expected-value-spinner',
        target: 'prize',
      },
      stages: [
        {
          stageId: 'stage-wedge-prob',
          format: 'free-response',
          prompt: 'The four wedges are equally likely. **What is the probability of landing on any one specific wedge**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '1/4',
          tolerance: 0.02,
          placeholder: 'e.g. 1/4, 0.25, or 25%',
          hints: [
            'Count the wedges. They are all the same size, so they are equally likely.',
            'Use P = successful outcomes / total possible outcomes — one wedge out of four.',
          ],
          explanation: 'Each of the 4 equal wedges is equally likely, so P(one wedge) = 1/4 = 25%.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-expected-value',
          format: 'free-response',
          prompt: 'Weight each payoff by 1/4 and add them up. **What is E[X], the expected payoff per spin**? Enter a number of points.',
          acceptedAnswer: '3',
          unit: 'points',
          placeholder: 'a number of points',
          hints: [
            'E[X] = Σ (value × probability). Every wedge has probability 1/4.',
            'That is the same as the plain average of the four payoffs: add them, divide by 4.',
            'Work out (0 + 2 + 4 + 6) ÷ 4.',
          ],
          explanation: 'E[X] = 1/4×0 + 1/4×2 + 1/4×4 + 1/4×6 = (0 + 2 + 4 + 6)/4 = 12/4 = 3 points. That matches the average the spinner converges to.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-expected-winnings',
      type: 'problem',
      format: 'order',
      title: 'Rank the spinners by long-run payoff',
      description: 'With four equal wedges, the expected value is just the average of the four payoffs. A higher expected value means a higher total over many spins — rank these spinners by it.',
      demo: {
        demoType: 'expected-value-spinner',
        target: 'prize',
      },
      demoFirst: true,
      orderItems: [
        { id: 'low', label: 'Wedges pay 0, 0, 0, 4' },
        { id: 'mid', label: 'Wedges pay 0, 2, 4, 6' },
        { id: 'high', label: 'Wedges pay 1, 5, 6, 8' },
      ],
      orderSolution: ['low', 'mid', 'high'],
      orderStartLabel: 'Lowest expected value',
      orderEndLabel: 'Highest expected value',
      question: 'Drag the spinners from **lowest expected value (top) to highest (bottom)**.',
      hints: [
        'Average the four equal payoffs: add them and divide by 4.',
        '0+0+0+4 = 4 → average 1; 0+2+4+6 = 12 → average 3.',
        '1+5+6+8 = 20 → average 5, the highest. So the order is 1, 3, 5.',
      ],
      explanation: 'Averaging the four equal wedges gives expected values of 1, 3, and 5 points. Higher payoffs across the wedges mean a higher long-run average — so over many spins the totals grow in exactly this order.',
      incorrectFeedback: 'For equal wedges, the expected value is just the average of the four payoffs. Add each spinner\'s payoffs and divide by 4, then order them.',
    },
    {
      stepId: 'problem-fair-game',
      type: 'problem',
      format: 'multi-stage',
      title: 'Is this game fair?',
      explore: {
        body: 'A game is fair when your expected NET gain — average payoff minus cost — is 0. Suppose the arcade toss above (average payoff 3 points) now costs 4 points per ball.',
        continueLabel: 'Continue to the question',
      },
      question: 'Now answer both parts using the arcade toss above.',
      demo: {
        demoType: 'arcade-rings',
      },
      stages: [
        {
          stageId: 'stage-net-per-play',
          format: 'free-response',
          prompt: 'The average payoff is 3 points and each ball costs 4 points. **What is your expected NET gain per ball**? Enter a number (it may be negative).',
          acceptedAnswer: '-1',
          placeholder: 'e.g. -1',
          hints: [
            'Net gain = expected payoff − cost.',
            'You get 3 points on average but pay 4 to play.',
            'Work out 3 − 4.',
          ],
          explanation: 'Expected net = 3 − 4 = −1 point per ball. On average you lose a point each toss, so the game is not fair — it is stacked against you.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-net-total',
          format: 'free-response',
          prompt: 'If you keep playing this game for 10 balls, **about how many points do you expect to gain in total**? Enter a number (it may be negative).',
          acceptedAnswer: '-10',
          placeholder: 'e.g. -10',
          hints: [
            'Expected total net = expected net per ball × number of balls.',
            'Each ball averages −1 point, and you toss 10 times.',
            'Work out −1 × 10.',
          ],
          explanation: 'Expected total net = −1 × 10 = −10 points. A small per-toss disadvantage adds up: over 10 balls you expect to be down about 10 points.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-fair-game-why',
      type: 'problem',
      title: 'What would make it fair?',
      description: 'Use the arcade toss above: its rings pay 3 points on average over many balls.',
      question: 'The arcade toss pays 3 points on average. **What one-time cost per ball would make this game exactly fair**?',
      demo: {
        demoType: 'arcade-rings',
      },
      demoFirst: true,
      choices: [
        { label: '3 points — set the cost equal to the expected payoff so the expected net gain is 0.', value: 'three' },
        { label: '0 points — any game with a positive payoff is automatically fair.', value: 'zero' },
        { label: '12 points — match the biggest prize a single ball can win.', value: 'biggest' },
        { label: 'No cost can make it fair, because the result is random.', value: 'never' },
      ],
      answer: 'three',
      explanation: 'A game is fair when expected payoff − cost = 0, so the fair cost equals the expected value: 3 points. Charge less and the game favors the player; charge more (like the 4-point version) and it favors the house. Randomness alone does not make a game unfair — the balance between average payoff and cost does.',
      incorrectFeedback: 'Give it another try.',
    },
  ],
};

export const bayesUpdatingLesson: Lesson = {
  lessonId: 'bayes-updating',
  order: 7,
  contentVersion: 5,
  title: 'Updating Beliefs',
  summary: 'Use counts out of a population to update a belief after a test result — and see why a positive test can still mean low odds.',
  tags: ['bayes', 'conditional', 'evidence'],
  estimatedMinutes: 14,
  masteryCriteria: {
    minFirstAttemptAccuracy: 0.8,
    minCompletedSteps: 4,
  },
  steps: [
    {
      stepId: 'concept-updating-beliefs',
      type: 'concept',
      title: 'Evidence changes the count',
      demoFirst: true,
      pretrieval: {
        prompt: 'Before moving the sliders: among positive tests, which two groups should be counted?',
      },
      body: 'Conditional probability showed that new information changes which group you count. Updating a belief is the same, but now the information is evidence — like a test result.',
      bodyAfterDemo: 'Counting real people is easier than juggling percentages. Drag the sliders above and watch the outlined "tests positive" group: of everyone who tests positive, what share are the true positives?',
      demo: {
        demoType: 'bayes-frequency-lab',
      },
    },
    {
      stepId: 'problem-build-counts',
      type: 'problem',
      format: 'sort',
      title: 'Label the four kinds of people',
      description: 'Picture a town of 1,000 people, each one of four kinds depending on whether they have the condition and how they test. Drop each group onto its correct label.',
      demo: {
        demoType: 'bayes-frequency',
      },
      demoFirst: true,
      sortItems: [
        { id: 'tp', label: 'Has it · tests positive' },
        { id: 'fn', label: 'Has it · tests negative' },
        { id: 'fp', label: "Doesn't have it · tests positive" },
        { id: 'tn', label: "Doesn't have it · tests negative" },
      ],
      sortBuckets: [
        { id: 'true-positive', label: 'True positive', hint: 'Caught correctly' },
        { id: 'false-negative', label: 'False negative', hint: 'Missed' },
        { id: 'false-positive', label: 'False positive', hint: 'False alarm' },
        { id: 'true-negative', label: 'True negative', hint: 'Cleared correctly' },
      ],
      sortSolution: {
        tp: 'true-positive',
        fn: 'false-negative',
        fp: 'false-positive',
        tn: 'true-negative',
      },
      question: 'Drag each group onto its label: **true positive, false negative, false positive, or true negative**.',
      hints: [
        '"Positive/negative" describes the test result; "true/false" says whether the test was right.',
        'A true positive really has it and tests positive; a false positive is healthy but tests positive.',
        'A false negative has it but tests negative; a true negative is healthy and tests negative.',
      ],
      explanation: 'A "true positive" really has the condition and tests positive; a "false positive" is healthy but still tests positive. When a condition is rare, the many healthy people produce lots of false positives — which is exactly why a positive result can still mean low odds. Keep these four groups straight and the rest is just counting.',
      incorrectFeedback: 'Split the label in two: the test result (positive/negative) and whether the test was correct (true/false). Re-check which group each describes.',
    },
    {
      stepId: 'problem-find-posterior',
      type: 'problem',
      format: 'multi-stage',
      title: 'How likely is it now?',
      description: 'Keep the same town: 90 true positives and 180 false positives. Now turn those counts into the updated belief.',
      question: 'Someone in this town tests positive. Work out how likely they are to actually have the condition.',
      demo: {
        demoType: 'bayes-frequency-lab',
      },
      stages: [
        {
          stageId: 'stage-total-positive',
          format: 'free-response',
          prompt: 'Add the true positives and false positives. **How many people test positive in total**? Enter a whole number.',
          acceptedAnswer: '270',
          placeholder: 'a whole number of people',
          hints: [
            'Everyone who tests positive is either a true positive or a false positive.',
            'Add the 90 true positives to the 180 false positives.',
          ],
          explanation: 'Total positives = 90 true positives + 180 false positives = 270 people. This is the denominator — the whole group you now condition on.',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
        {
          stageId: 'stage-posterior',
          format: 'free-response',
          prompt: 'Of those 270 positive testers, only the 90 true positives really have the condition. **What is P(condition | positive)**? Enter a fraction, decimal, or percent.',
          acceptedAnswer: '90/270',
          tolerance: 0.02,
          placeholder: 'e.g. 90/270, 1/3, or 33%',
          hints: [
            'P(condition | positive) = true positives / all positives.',
            'Put the 90 true positives over the 270 total positives.',
            '90/270 reduces to 1/3.',
          ],
          explanation: 'P(condition | positive) = 90/270 = 1/3 ≈ 33%. Even after a positive result on a fairly accurate test, there is only about a 1-in-3 chance the person truly has the condition. (This ratio is exactly Bayes\' rule, P(H | E) = P(E | H) × P(H) / P(E) — counting bodies just skips the algebra.)',
          incorrectFeedback: 'Use a hint if you\'re stuck!',
        },
      ],
    },
    {
      stepId: 'problem-tune-false-alarms',
      type: 'problem',
      format: 'slider',
      title: 'Tune the false alarms',
      description: 'Start from the same town: 90 people have the condition and all 90 test positive. Drag the false alarms and watch how trustworthy a positive becomes.',
      question: 'Drag the false alarms until a positive test is a 50/50 coin flip — P(condition | positive) = 50%. **How many false positives makes a positive even money?**',
      demo: {
        demoType: 'bayes-screening-slider',
      },
      sliderMin: 0,
      sliderMax: 270,
      sliderStep: 10,
      acceptedAnswer: '90',
      tolerance: 5,
      hints: [
        'A positive is 50/50 when the false alarms exactly match the true positives.',
        'There are 90 true positives — match that count.',
        'Slide until the posterior readout shows 50%.',
      ],
      explanation: 'With 90 true positives, a positive is a coin flip when there are also 90 false positives: P = 90 / (90 + 90) = 90/180 = 50%. Fewer false alarms makes a positive more trustworthy; more false alarms drags it down.',
      incorrectFeedback: 'Watch the posterior readout — nudge the false alarms until it reads 50%.',
    },
    {
      stepId: 'problem-posterior-fresh',
      type: 'problem',
      format: 'free-response',
      title: 'A spam filter',
      description: 'A fresh scenario with the same kind of counting — now an email spam filter.',
      question: 'A filter scans 1,000 emails. 40 are truly spam and the filter flags all 40. Of the 960 real emails, 120 also get flagged. **If an email is flagged, what is the probability it is actually spam**? Enter a fraction, decimal, or percent.',
      demo: {
        demoType: 'bayes-frequency-lab',
      },
      demoFirst: true,
      acceptedAnswer: '40/160',
      tolerance: 0.02,
      placeholder: 'e.g. 40/160, 1/4, or 25%',
      hints: [
        'First find the total flagged: real spam caught plus real emails wrongly flagged.',
        '40 true spam + 120 false alarms = 160 flagged emails.',
        'Posterior = true spam / all flagged = 40/160.',
      ],
      explanation: 'Flagged total = 40 + 120 = 160, and 40 are truly spam, so P(spam | flagged) = 40/160 = 1/4 = 25%. Even though the filter catches every real spam, most flagged emails are legitimate — because spam is rare here, the false alarms pile up.',
      incorrectFeedback: 'Use a hint if you\'re stuck!',
    },
    {
      stepId: 'problem-bayes-why',
      type: 'problem',
      title: 'Why so low?',
      description: 'Set a low base rate but high sensitivity in the lab above and watch the orange false positives swamp the green true positives.',
      question: 'The test catches 90% of real cases, yet a positive result meant only a 1-in-3 chance of truly having the condition. **Why is the updated probability so much lower than the test\'s accuracy**?',
      demo: {
        demoType: 'bayes-frequency-lab',
      },
      demoFirst: true,
      choices: [
        { label: 'The condition is rare, so the many healthy people produce more false positives than the few real cases produce true positives.', value: 'base-rate' },
        { label: 'The test is broken — a 90% test should make a positive 90% certain.', value: 'broken' },
        { label: 'Conditional probability does not apply once you have a test result.', value: 'no-conditional' },
        { label: 'The false positives should be ignored because those people are healthy.', value: 'ignore-fp' },
      ],
      answer: 'base-rate',
      explanation: 'Because the condition is rare, there are far more healthy people (900) than sick people (100). Even a modest 20% false-positive rate on that large healthy group (180 false positives) swamps the 90 true positives. This is the base-rate effect: the posterior depends on how common the condition is, not just on how accurate the test is.',
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
  expectedValueLesson,
  bayesUpdatingLesson,
];
