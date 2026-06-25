import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import vm from 'vm';
import { pathToFileURL } from 'url';
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

export const INTRO_LESSON_ID = 'intro-basic-probability';

export function loadAllLessons() {
  const lessonModelPath = path.resolve(process.cwd(), 'src/models/lesson.ts');
  if (!fs.existsSync(lessonModelPath)) {
    throw new Error(`Lesson model not found at ${lessonModelPath}`);
  }

  const sourceText = fs.readFileSync(lessonModelPath, 'utf8');
  const transpiled = ts.transpileModule(sourceText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const sandbox = {
    exports: {},
    module: { exports: {} },
  };

  vm.runInNewContext(transpiled.outputText, sandbox, {
    filename: lessonModelPath,
  });

  const lessons = sandbox.exports.allLessons;
  if (!Array.isArray(lessons) || lessons.length === 0) {
    throw new Error('Could not load allLessons from src/models/lesson.ts.');
  }

  return lessons;
}

/**
 * Returns the canonical intro lesson ('intro-basic-probability') straight from
 * the live app model in src/models/lesson.ts. This loads the same source of
 * truth as the seeder (no hardcoded steps or contentVersion), so callers always
 * get the current lesson definition.
 */
export function loadIntroLesson() {
  const lessons = loadAllLessons();
  const introLesson = lessons.find((lesson) => lesson.lessonId === INTRO_LESSON_ID);
  if (!introLesson) {
    throw new Error(
      `Intro lesson '${INTRO_LESSON_ID}' not found in src/models/lesson.ts.`
    );
  }

  return introLesson;
}

export async function seedLesson() {
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

  const lessons = loadAllLessons();

  for (const lesson of lessons) {
    const lessonRef = db.doc(`lessons/${lesson.lessonId}`);
    await lessonRef.set(lesson, { merge: true });
    console.log(`Seeded lesson '${lesson.lessonId}' into Firestore.`);
  }

  console.log(`Seeded ${lessons.length} lessons into Firestore.`);
}

const isCliRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCliRun) {
  seedLesson().catch((error) => {
    console.error('Failed to seed Firestore lesson:', error);
    process.exit(1);
  });
}
