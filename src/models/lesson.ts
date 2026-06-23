export type LessonStepType = 'concept' | 'simulation' | 'problem';

export interface BaseStep {
  stepId: string;
  type: LessonStepType;
  title: string;
}

export interface ConceptStep extends BaseStep {
  type: 'concept';
  body: string;
  illustration?: string;
}

export interface SimulationStep extends BaseStep {
  type: 'simulation';
  prompt: string;
  simulationType: 'coin-flip' | 'dice-roll';
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

export interface ProblemStep extends BaseStep {
  type: 'problem';
  question: string;
  choices: ProblemChoice[];
  answer: string;
  explanation: string;
  incorrectFeedback?: string;
  variants?: ProblemVariant[];
}

export type LessonStep = ConceptStep | SimulationStep | ProblemStep;

export interface MasteryCriteria {
  minFirstAttemptAccuracy: number;
  minCompletedSteps: number;
}

export interface Lesson {
  lessonId: string;
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
  contentVersion: 10,
  title: 'Intro to Probability',
  summary: 'Build an intuition for chance, then test your predictions with animated experiments.',
  tags: ['basic-probability', 'coins', 'dice'],
  estimatedMinutes: 12,
  masteryCriteria: {
    minFirstAttemptAccuracy: 0.8,
    minCompletedSteps: 5,
  },
  steps: [
    {
      stepId: 'concept-what-is-probability',
      type: 'concept',
      title: 'What is probability?',
      body: 'Probability is how often we expect an event to happen.\n\nIf something is impossible, its probability is 0%. If something is guaranteed, its probability is 100%. Most events live in between.\n\nTake a fair coin as an example. Heads and tails are equally likely, so before we flip, our best expectation is about half heads and half tails. That intuition leads directly to the formula:\n\nP(event) = successful outcomes / total possible outcomes\n\nFor a coin: 1 heads side out of 2 total sides → P(heads) = 1/2 = 50%.',
    },
    {
      stepId: 'problem-coin-probability',
      type: 'problem',
      title: 'Expected percentage',
      question: 'You flip a fair coin 1,000 times. About what percentage of the flips should you expect to be heads?',
      choices: [
        { label: 'About 10%', value: '10%' },
        { label: 'About 50%', value: '50%' },
        { label: 'About 75%', value: '75%' },
        { label: 'Exactly 100%', value: '100%' },
      ],
      answer: '50%',
      explanation: 'Heads is still 1 favorable outcome out of 2 possible outcomes, so the expected percentage is 1/2 = 50%. With 1,000 flips, the result may not be exactly 500 heads, but it should usually be close.',
      incorrectFeedback: 'Not quite. Use successful outcomes divided by total possible outcomes. The number of flips changes how many trials you run, not the chance on each fair flip.',
      variants: [
        {
          question: 'You flip a fair coin 500 times. About what percentage of the flips should you expect to be heads?',
          choices: [
            { label: 'About 10%', value: '10%' },
            { label: 'About 50%', value: '50%' },
            { label: 'About 75%', value: '75%' },
            { label: 'Exactly 100%', value: '100%' },
          ],
          answer: '50%',
          explanation: 'Heads is still 1 favorable outcome out of 2 possible outcomes, so the expected percentage is 1/2 = 50%. With 500 flips, the result may not be exactly 250 heads, but it should usually be close.',
          incorrectFeedback: 'Not quite. Use successful outcomes divided by total possible outcomes. The number of flips changes how many trials you run, not the chance on each fair flip.',
        },
        {
          question: 'You flip a fair coin 2,000 times. About what percentage of the flips should you expect to be heads?',
          choices: [
            { label: 'About 10%', value: '10%' },
            { label: 'About 50%', value: '50%' },
            { label: 'About 75%', value: '75%' },
            { label: 'Exactly 100%', value: '100%' },
          ],
          answer: '50%',
          explanation: 'Heads is still 1 favorable outcome out of 2 possible outcomes, so the expected percentage is 1/2 = 50%. With 2,000 flips, the result may not be exactly 1,000 heads, but it should usually be close.',
          incorrectFeedback: 'Not quite. Use successful outcomes divided by total possible outcomes. The number of flips changes how many trials you run, not the chance on each fair flip.',
        },
        {
          question: 'You flip a fair coin 200 times. About what percentage of the flips should you expect to be heads?',
          choices: [
            { label: 'About 10%', value: '10%' },
            { label: 'About 50%', value: '50%' },
            { label: 'About 75%', value: '75%' },
            { label: 'Exactly 100%', value: '100%' },
          ],
          answer: '50%',
          explanation: 'Heads is still 1 favorable outcome out of 2 possible outcomes, so the expected percentage is 1/2 = 50%. With 200 flips, the result may not be exactly 100 heads, but it should usually be close.',
          incorrectFeedback: 'Not quite. Use successful outcomes divided by total possible outcomes. The number of flips changes how many trials you run, not the chance on each fair flip.',
        },
      ],
    },
    {
      stepId: 'simulation-coin-flip',
      type: 'simulation',
      title: 'Coin lab: what should we expect?',
      prompt: 'A fair coin should land near 50% heads over many flips. Test how that pattern appears as the run gets larger.',
      simulationType: 'coin-flip',
      config: {
        rolls: 20,
        target: 'Heads',
      },
      reflectionPrompt: 'Try 10 flips, then 100, then 500. Look for the heads percentage: does it wander less as the run gets larger?',
      correctInterpretation: 'Theoretical probability is based on the sample space: 1 heads side out of 2 coin sides. Experimental probability is what happened in your trials: heads observed divided by total flips.',
    },
    {
      stepId: 'concept-dice',
      type: 'concept',
      title: 'From two choices to six',
      body: 'The coin had two equally likely outcomes. Now imagine a wheel split into six equal slices labeled 1, 2, 3, 4, 5, and 6.\n\nIf the wheel is fair, no slice is special. Landing on 4 should be less common than heads on a coin because 4 is only one slice out of six, not one side out of two.',
    },
    {
      stepId: 'problem-wheel-prediction',
      type: 'problem',
      title: 'Make a prediction before spinning',
      question: 'A fair wheel has 6 equal faces. What percentage of spins should land on one specific face, like 4?',
      choices: [
        { label: 'About 5%', value: '5%' },
        { label: 'About 16.7%', value: '16.7%' },
        { label: 'About 50%', value: '50%' },
        { label: 'About 100%', value: '100%' },
      ],
      answer: '16.7%',
      explanation: 'One specific face is 1 favorable outcome out of 6 equally likely outcomes. 1/6 is about 16.7%, so that is what we expect over a large number of spins.',
      incorrectFeedback: 'Not quite. Count how many equal faces are on the wheel, then ask how many of those faces match the target.',
    },
    {
      stepId: 'simulation-dice-roll',
      type: 'simulation',
      title: 'Wheel lab: watch 1 out of 6 emerge',
      prompt: 'Now test your prediction. Choose a target face and spin the six-face wheel. The hands show many spins happening at once; the percentage shows how often your target has appeared so far.',
      simulationType: 'dice-roll',
      config: {
        rolls: 60,
        target: '4',
      },
      reflectionPrompt: 'Try 6 spins, then 120, then 600. Watch the target percentage: does it move toward about 16.7%?',
      correctInterpretation: 'Theoretical probability says one chosen face has probability 1/6. Experimental probability can bounce around in short runs because random results are noisy.',
    },
    {
      stepId: 'problem-dice-probability',
      type: 'problem',
      title: 'Predict the count',
      question: 'You spin the fair six-face wheel 600 times while watching Face 4. About how many times should you expect Face 4 to appear?',
      choices: [
        { label: 'About 10 times', value: '10' },
        { label: 'About 60 times', value: '60' },
        { label: 'About 100 times', value: '100' },
        { label: 'About 300 times', value: '300' },
      ],
      answer: '100',
      explanation: 'One face should appear about 1/6 of the time. 1/6 of 600 is 100, so Face 4 should appear about 100 times.',
      incorrectFeedback: 'Not quite. First find the fraction for one target face, then apply that fraction to the total number of spins.',
      variants: [
        {
          question: 'You spin the fair six-face wheel 120 times while watching Face 3. About how many times should you expect Face 3 to appear?',
          choices: [
            { label: 'About 2 times', value: '2' },
            { label: 'About 20 times', value: '20' },
            { label: 'About 40 times', value: '40' },
            { label: 'About 60 times', value: '60' },
          ],
          answer: '20',
          explanation: 'One face should appear about 1/6 of the time. 1/6 of 120 is 20, so Face 3 should appear about 20 times.',
          incorrectFeedback: 'Not quite. First find the fraction for one target face, then apply that fraction to the total number of spins.',
        },
        {
          question: 'You spin the fair six-face wheel 300 times while watching Face 5. About how many times should you expect Face 5 to appear?',
          choices: [
            { label: 'About 5 times', value: '5' },
            { label: 'About 30 times', value: '30' },
            { label: 'About 50 times', value: '50' },
            { label: 'About 150 times', value: '150' },
          ],
          answer: '50',
          explanation: 'One face should appear about 1/6 of the time. 1/6 of 300 is 50, so Face 5 should appear about 50 times.',
          incorrectFeedback: 'Not quite. First find the fraction for one target face, then apply that fraction to the total number of spins.',
        },
        {
          question: 'You spin the fair six-face wheel 1,200 times while watching Face 2. About how many times should you expect Face 2 to appear?',
          choices: [
            { label: 'About 20 times', value: '20' },
            { label: 'About 120 times', value: '120' },
            { label: 'About 200 times', value: '200' },
            { label: 'About 600 times', value: '600' },
          ],
          answer: '200',
          explanation: 'One face should appear about 1/6 of the time. 1/6 of 1,200 is 200, so Face 2 should appear about 200 times.',
          incorrectFeedback: 'Not quite. First find the fraction for one target face, then apply that fraction to the total number of spins.',
        },
      ],
    },
    {
      stepId: 'problem-even-dice',
      type: 'problem',
      title: 'Interpret the experiment',
      question: 'You spin the wheel 60 times and Face 4 appears 6 times. The expected amount is about 10 times. What is the best interpretation?',
      choices: [
        { label: 'The wheel must be unfair.', value: 'unfair' },
        { label: 'Face 4 has probability 6/60 forever now.', value: 'forever' },
        { label: 'This can happen in a short run; try more spins before judging.', value: 'short-run' },
        { label: 'The expected probability changed to 10%.', value: 'changed' },
      ],
      answer: 'short-run',
      explanation: 'In only 60 spins, the observed result can wobble away from the expected value. A larger run gives better evidence about whether the wheel is behaving fairly.',
      incorrectFeedback: 'Not quite. Think about whether a small batch of spins is enough evidence to judge the wheel, or whether random wobble could explain it.',
      variants: [
        {
          question: 'You spin the wheel 30 times and Face 4 appears 2 times. The expected amount is about 5 times. What is the best interpretation?',
          choices: [
            { label: 'The wheel must be unfair.', value: 'unfair' },
            { label: 'Face 4 has probability 2/30 forever now.', value: 'forever' },
            { label: 'This can happen in a short run; try more spins before judging.', value: 'short-run' },
            { label: 'The expected probability changed to about 7%.', value: 'changed' },
          ],
          answer: 'short-run',
          explanation: 'In only 30 spins, the observed result can wobble away from the expected value. A larger run gives better evidence about whether the wheel is behaving fairly.',
          incorrectFeedback: 'Not quite. Think about whether a small batch of spins is enough evidence to judge the wheel, or whether random wobble could explain it.',
        },
        {
          question: 'You spin the wheel 120 times and Face 2 appears 14 times. The expected amount is about 20 times. What is the best interpretation?',
          choices: [
            { label: 'The wheel must be unfair.', value: 'unfair' },
            { label: 'Face 2 has probability 14/120 forever now.', value: 'forever' },
            { label: 'This can happen in a short run; try more spins before judging.', value: 'short-run' },
            { label: 'The expected probability changed to about 12%.', value: 'changed' },
          ],
          answer: 'short-run',
          explanation: 'In only 120 spins, the observed result can wobble away from the expected value. A larger run gives better evidence about whether the wheel is behaving fairly.',
          incorrectFeedback: 'Not quite. Think about whether a small batch of spins is enough evidence to judge the wheel, or whether random wobble could explain it.',
        },
        {
          question: 'You spin the wheel 300 times and Face 6 appears 39 times. The expected amount is about 50 times. What is the best interpretation?',
          choices: [
            { label: 'The wheel must be unfair.', value: 'unfair' },
            { label: 'Face 6 has probability 39/300 forever now.', value: 'forever' },
            { label: 'This can happen with random variation; try many more spins before judging.', value: 'short-run' },
            { label: 'The expected probability changed to about 13%.', value: 'changed' },
          ],
          answer: 'short-run',
          explanation: 'In 300 spins the observed result can still wobble away from the expected value. A much larger run gives stronger evidence about whether the wheel is behaving fairly.',
          incorrectFeedback: 'Not quite. Think about whether this number of spins is enough evidence to judge the wheel, or whether random wobble could explain it.',
        },
      ],
    },
  ],
};
