## Plan: Brilliant Probability MVP

TL;DR  
Build a scratch React + Firebase MVP for a high-school probability app focused on basic probability with coins and dice. The architecture uses data-driven lesson content in Firestore, a generic lesson renderer, interactive simulators, instant feedback, persistent user progress, daily streaks, and a course path page with mastery recommendations.

**MVP Definition**
- Target learner: high school student (14–18) studying Probability & Statistics.
- Core outcome: an interactive, learn-by-doing lesson on basic probability with coins and dice.
- Must-have features:
  - auth with Firebase Auth and email/Google sign-in
  - a single data-driven lesson in Firestore
  - one coin-flip simulator and one dice-roll simulator
  - instant explanation-based feedback for each question
  - persistent progress and resume capability
  - course path view with mastery tracking and next-step recommendation
  - mobile-responsive UI
  - streaks and milestone display
- Excluded from Phase 1: AI content generation, advanced conditional probability, multiplayer, teacher dashboard, offline mode.

**Steps**
1. Project scaffolding
   - Create a Vite React + TypeScript app in brilliant.
   - Install `firebase`, `react-router-dom`, `@mui/material` or lightweight UI library, and `framer-motion` or CSS transitions.
   - Initialize Firebase config and create `src/firebase.ts`.

2. Content model and Firestore schema
   - Define lesson JSON structure in `src/models/lesson.ts` and match it with Firestore documents in a `lessons` collection.
   - Define user progress in `users/{uid}/progress/{lessonId}` and streak state in `users/{uid}`.
   - Create a concrete lesson doc for `intro-basic-probability`.

3. Auth + data services
   - Implement `src/services/authService.ts` with Firebase Auth email/password + Google sign-in.
   - Implement `src/services/lessonService.ts` to load lessons from Firestore and cache locally if needed.
   - Implement `src/services/progressService.ts` to read/write lesson progress and streak updates.

4. App routes and page scaffolding
   - Build `src/routes/HomePage.tsx`, `CoursePathPage.tsx`, `LessonPlayerPage.tsx`, `SignInPage.tsx`, and `ProfilePage.tsx`.
   - Use `react-router-dom` with routes `/`, `/course`, `/lesson/:lessonId`, `/signin`, `/profile`.

5. Lesson state machine and renderer
   - Create `src/hooks/useLessonState.ts` to manage `currentStepIndex`, `attemptsByStep`, `feedbackState`, and `lessonComplete`.
   - Implement `src/components/lesson/LessonStepRenderer.tsx` to dispatch step types to `ConceptStepCard`, `SimulationStepCard`, or `ProblemStepCard`.
   - Build reusable interactive components: `CoinFlipSimulator`, `DiceRollSimulator`, `FrequencyChart`, `FeedbackPanel`, `ProgressPill`.

6. Progress, mastery, streaks
   - Persist user progress after each step in `users/{uid}/progress/{lessonId}`.
   - Record `firstAttemptCorrect` for problem steps.
   - Compute mastery on completion: `score = problemStepsCorrectOnFirstAttempt / totalProblemSteps`; mastery if `score >= 0.8` and lesson finished.
   - Update streaks with `lastActiveDate`, `currentStreak`, and `longestStreak` on lesson completion or sign-in.

7. MVP polishing and deployment
   - Ensure mobile responsive layout; test on narrow widths.
   - Add `CoursePathCard` and recommendation text: next lesson `Practice: Coin & Dice Intuition` if not mastered.
   - Deploy to Firebase Hosting.

**Relevant files**
- `src/firebase.ts` — Firebase Auth and Firestore initialization.
- `src/models/lesson.ts` — lesson step type definitions and schema.
- `src/services/authService.ts` — sign-in/sign-up and user profile reads.
- `src/services/lessonService.ts` — lesson loading from Firestore.
- `src/services/progressService.ts` — save/load lesson progress and streak updates.
- `src/hooks/useLessonState.ts` — lesson step state machine.
- `src/components/lesson/*` — generic lesson renderer and interactive simulators.
- `src/routes/CoursePathPage.tsx` — course path, mastery totals, and next-step recommendation.
- `src/routes/LessonPlayerPage.tsx` — player UI with step navigation and instant feedback.

**Content model**
- Collection `lessons` document schema:
  - `lessonId`: string
  - `title`: string
  - `summary`: string
  - `tags`: string[]
  - `estimatedMinutes`: number
  - `steps`: array of typed step objects
  - `masteryCriteria`: object with `minFirstAttemptAccuracy` and `minCompletedSteps`

- Step types
  - `concept` step: `stepId`, `type`, `title`, `body`, optional `illustration`.
  - `simulation` step: `stepId`, `type`, `title`, `prompt`, `simulationType` (`coin-flip` or `dice-roll`), `config`, `reflectionPrompt`, `correctInterpretation`.
  - `problem` step: `stepId`, `type`, `title`, `question`, `choices`, `answer`, `explanation`.

- Example lesson document `intro-basic-probability`:
  - `title`: "Intro to Probability"
  - `summary`: "Learn coin and dice probability with interactive flips and instant feedback."
  - `tags`: ["basic-probability", "coins", "dice"]
  - `steps`: 7 steps including concept, simulation, and problem steps.

**Firestore schema**
- `users/{uid}`
  - `displayName`: string
  - `email`: string
  - `createdAt`: timestamp
  - `lastLoginAt`: timestamp
  - `lastActiveDate`: string (`YYYY-MM-DD`)
  - `currentStreak`: number
  - `longestStreak`: number
  - `masterySummary`: map of `lessonId` to `{ score:number, status:string, lastUpdated:timestamp }`

- `users/{uid}/progress/{lessonId}`
  - `lessonId`: string
  - `lastStepIndex`: number
  - `completed`: boolean
  - `score`: number
  - `masteryStatus`: `not-started | in-progress | mastered`
  - `stepAttempts`: map of `stepId` to `{ attempts:number, correctFirstAttempt:boolean, lastResult:string }`
  - `updatedAt`: timestamp

- `lessons/{lessonId}`
  - lesson definition as above

**Lesson state machine**
- State fields
  - `currentStepIndex`
  - `currentStepId`
  - `attemptsByStep`
  - `feedbackState`: `idle | correct | incorrect | partial`
  - `lastAction`: metadata about the latest answer or simulation result
- Events
  - `startLesson`, `submitAnswer`, `runSimulation`, `nextStep`, `retryStep`, `lessonComplete`
- Transitions
  - answering a problem updates `attemptsByStep` and `feedbackState` immediately; correct answers move the learner to the next step after feedback.
  - simulation interaction updates the local `simulationResult` and shows dynamic visualization.
  - reaching last step triggers `lessonComplete` and persisted progress plus mastery compute.

**Streak logic**
- Use `lastActiveDate` stored per user.
- On user-active event (sign-in or lesson complete):
  - if `today === lastActiveDate`, leave `currentStreak` unchanged.
  - if `yesterday === lastActiveDate`, increment `currentStreak` by 1.
  - otherwise reset `currentStreak` to 1.
  - update `longestStreak` if `currentStreak` exceeds it.
- Store `lastActiveDate` as local date string so Firebase timezone drift cannot break streak.

**Mastery scoring**
- At lesson completion, compute `firstAttemptAccuracy = correctFirstAttemptProblemSteps / totalProblemSteps`.
- `mastered` if `firstAttemptAccuracy >= 0.8` and the lesson has `completed=true`.
- `practiceReady` if `completed=true` but accuracy < 0.8.
- Persist `masterySummary[lessonId]` with `score`, `status`, and `lastUpdated`.
- On Course Path page, recommend next step based on `masteryStatus`.

**Route structure**
- `/` — Home page with streak, milestone widget, and link to course path.
- `/course` — Course path overview showing lessons, mastery badges, and next recommendation.
- `/lesson/:lessonId` — Lesson player with step renderer and progress bar.
- `/signin` — Auth page.
- `/profile` — Profile and streak history summary.

**Concrete lesson plan: Intro to Probability**
- Step 1: Concept — "What is probability?" Introduce probability as chance of an event between 0 and 1 using a coin.
- Step 2: Simulation — "Flip the coin" with a coin-flip button and live head/tail tally. Ask "How often did heads appear?" and show a frequency chart.
- Step 3: Problem — "What is the probability of heads on one fair coin flip?" Choices: 0, 0.25, 0.5, 1.0; explain why 0.5 is correct.
- Step 4: Concept — "Dice have six equally likely sides." Show a colored die face illustration.
- Step 5: Simulation — "Roll one die 20 times" with an interactive die roll and bar chart. Ask learners to observe which face appears most often.
- Step 6: Problem — "What is the probability of rolling a 4?" Choices: 1/2, 1/3, 1/6, 1/12; explain 1/6.
- Step 7: Problem — “What is the probability of rolling an even number on one fair six-sided die?” Choices: 1/6, 1/3, 1/2, 2/3; explain that three of the six faces are even, so the probability is 1/2.

**Verification**
1. Confirm the app boots locally with `npm run dev` and loads the home page.
2. Sign up with Firebase Auth and verify user creation in Firestore.
3. Open `/lesson/intro-basic-probability`, interact with coin and dice simulations, submit answers, and confirm instant feedback and persisted progress.
4. Reload the page mid-lesson and verify progress resumes at the last unfinished step.
5. Complete the lesson and verify `users/{uid}/progress/intro-basic-probability` and `users/{uid}` streak/mastery fields.
6. Deploy to Firebase Hosting and confirm the public app is reachable.

**Decisions**
- Use Firestore for both lesson content and user progress so the app is data-driven and extensible without code changes.
- Focus Phase 1 on coins and dice with one lesson plus course path infrastructure.
- Keep mastery rule simple and explainable: first-attempt accuracy threshold.
- Implement instant feedback with explanation text instead of just correct/incorrect.


