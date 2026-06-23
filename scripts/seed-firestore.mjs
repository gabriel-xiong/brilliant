import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

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
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    return path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
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
      'Service account path is required to seed Firestore from Node. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_PATH in your environment or .env.'
    );
  }

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account file not found at ${serviceAccountPath}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId,
  });

  const db = admin.firestore();

  const lesson = {
    lessonId: 'intro-basic-probability',
    title: 'Intro to Probability',
    summary: 'Learn coin and dice probability with interactive flips and instant feedback.',
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
        body: 'Probability measures how likely an event is to happen. It ranges from 0 (impossible) to 1 (certain). A fair coin is a great first example because heads and tails are equally likely.',
      },
      {
        stepId: 'simulation-coin-flip',
        type: 'simulation',
        title: 'Flip the coin',
        prompt: 'Flip a fair coin several times and observe how often heads and tails appear.',
        simulationType: 'coin-flip',
        config: {
          rolls: 10,
        },
        reflectionPrompt: 'Did heads and tails show up roughly the same number of times? What does that tell you about probability?',
        correctInterpretation: 'A fair coin should show heads about half the time and tails about half the time in the long run.',
      },
      {
        stepId: 'problem-coin-probability',
        type: 'problem',
        title: 'Probability of heads',
        question: 'What is the probability of getting heads on one fair coin flip?',
        choices: [
          { label: '0', value: '0' },
          { label: '0.25', value: '0.25' },
          { label: '0.5', value: '0.5' },
          { label: '1.0', value: '1.0' },
        ],
        answer: '0.5',
        explanation: 'Because a fair coin has two equally likely sides, the probability of heads is 1 out of 2, or 0.5.',
      },
      {
        stepId: 'concept-dice',
        type: 'concept',
        title: 'Dice have six sides',
        body: 'A fair six-sided die has six equally likely outcomes. Each face appears with probability 1/6, so the chance of rolling any one specific number is one out of six.',
      },
      {
        stepId: 'simulation-dice-roll',
        type: 'simulation',
        title: 'Roll the die',
        prompt: 'Roll a die several times and observe how often each face appears.',
        simulationType: 'dice-roll',
        config: {
          rolls: 12,
        },
        reflectionPrompt: 'Which face showed up most often? Did some faces appear less often than others?',
        correctInterpretation: 'Each face should appear about the same amount in a fair die game, but short sequences can still look uneven.',
      },
      {
        stepId: 'problem-dice-probability',
        type: 'problem',
        title: 'Probability of a 4',
        question: 'What is the probability of rolling a 4 on one fair six-sided die?',
        choices: [
          { label: '1/2', value: '1/2' },
          { label: '1/3', value: '1/3' },
          { label: '1/6', value: '1/6' },
          { label: '1/12', value: '1/12' },
        ],
        answer: '1/6',
        explanation: 'There is one face with a 4 out of six possible faces, so the probability is 1/6.',
      },
      {
        stepId: 'problem-even-dice',
        type: 'problem',
        title: 'Even-number probability',
        question: 'What is the probability of rolling an even number on one fair six-sided die?',
        choices: [
          { label: '1/6', value: '1/6' },
          { label: '1/3', value: '1/3' },
          { label: '1/2', value: '1/2' },
          { label: '2/3', value: '2/3' },
        ],
        answer: '1/2',
        explanation: 'There are three even faces (2, 4, 6) out of six total faces, so the probability is 3/6 = 1/2.',
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
