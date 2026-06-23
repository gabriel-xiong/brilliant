import fs from 'fs';
import path from 'path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function loadDotEnv(envPath) {
  const envText = fs.readFileSync(envPath, 'utf8');
  return Object.fromEntries(
    envText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [key, ...parts] = line.split('=');
        return [key, parts.join('=')];
      })
  );
}

function getServiceAccountPath(env) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    return path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
  }

  const defaultLocalServiceAccountPath = path.resolve(process.cwd(), 'serviceaccount.json');
  if (fs.existsSync(defaultLocalServiceAccountPath)) {
    return defaultLocalServiceAccountPath;
  }

  return null;
}

async function seedLesson() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file not found in project root. Copy values from .env.example.');
  }

  const env = loadDotEnv(envPath);
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('VITE_FIREBASE_PROJECT_ID is missing from .env.');
  }

  const serviceAccountPath = getServiceAccountPath(env);
  if (!serviceAccountPath) {
    throw new Error(
      'Service account path is required to seed Firestore from Node. Add serviceaccount.json to the project root, or set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_PATH.'
    );
  }

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account file not found at ${serviceAccountPath}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount),
    projectId,
  });

  const db = getFirestore();

  const lesson = {
    lessonId: 'intro-basic-probability',
    contentVersion: 6,
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
        body: 'Probability is how often we expect an event to happen.\n\nIf something is impossible, its probability is 0%. If something is guaranteed, its probability is 100%. Most events live in between.\n\nTake a fair coin as an example. Heads and tails are equally likely, so before we flip, our best expectation is about half heads and half tails. The formula comes after that intuition: probability compares the outcomes we want with all the outcomes that could happen.',
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
        incorrectFeedback: 'Not quite. Use favorable outcomes divided by total possible outcomes. The number of flips changes how many trials you run, not the chance on each fair flip.',
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
        reflectionPrompt: 'Try 12 spins, then 120, then 600. Watch the target percentage: does it move toward about 16.7%?',
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
      },
    ],
  };

  const lessonRef = db.doc(`lessons/${lesson.lessonId}`);
  await lessonRef.set(lesson, { merge: true });
  console.log(`Seeded lesson '${lesson.lessonId}' into Firestore.`);
}

seedLesson().catch((error) => {
  console.error('Failed to seed Firestore lesson:', error);
  process.exit(1);
});
