/**
 * Course graph — the single source of truth for lesson prerequisites (unlock
 * rules) AND the map layout. It is keyed by `lessonId` strings so it stays
 * completely independent of the lesson *content* in `models/lesson.ts`;
 * changing one never forces a change to the other.
 *
 * The course is a strict LINEAR chain — a single trail where each lesson
 * unlocks the next, and only the next:
 *
 *     Introduction → Counting Outcomes → Compound Events
 *       → Conditional Probability → Mutually Exclusive Events
 *
 * Every lesson's only prerequisite is the lesson immediately before it, so
 * exactly one lesson is ever "up next". The map draws one continuous path with
 * no branches.
 *
 * Layout hints live here too so the course map and the unlock logic can never
 * disagree about the shape of the path:
 *   - `column` is the horizontal position along the trail (0 = start),
 *     incrementing by one for each lesson (even horizontal spacing).
 *   - `lane` is the vertical offset for the node: 0 = mid height, negative =
 *     up, positive = down. The lanes below trend steadily upward from the first
 *     lesson (lower left) to the last (upper right), but with a slight wave (a
 *     small mid-trail dip) so the smoothly curved connectors form gentle
 *     S-curves rather than one rigid straight diagonal.
 */

export interface CourseGraphNode {
  lessonId: string;
  /** lessonIds that must all be completed before this lesson unlocks. */
  prerequisites: string[];
  /** Horizontal map column (0 = start of the path). */
  column: number;
  /** Vertical lane within the column: 0 = center, <0 = up, >0 = down. */
  lane: number;
}

/** The very first lesson on the path — used as the brand-new-learner fallback. */
export const INTRO_LESSON_ID = 'intro-basic-probability';

/**
 * Note: the Conditional Probability lesson ships with the historical lessonId
 * `dependent-events` (see models/lesson.ts), so the graph references that id.
 *
 * Strict linear chain: each lesson's only prerequisite is the previous one.
 */
export const courseGraph: Record<string, CourseGraphNode> = {
  // L1 — lower-left start of the slope (lowest point).
  'intro-basic-probability': {
    lessonId: 'intro-basic-probability',
    prerequisites: [],
    column: 0,
    lane: 2,
  },
  // L2 — quick rise into the first gentle plateau.
  'counting-outcomes': {
    lessonId: 'counting-outcomes',
    prerequisites: ['intro-basic-probability'],
    column: 1,
    lane: 0.6,
  },
  // L3 — a slight dip in the wave (a touch lower than L2).
  'compound-events': {
    lessonId: 'compound-events',
    prerequisites: ['counting-outcomes'],
    column: 2,
    lane: 0.9,
  },
  // Conditional Probability — historical lessonId is `dependent-events`.
  // L4 — rising again toward the top.
  'dependent-events': {
    lessonId: 'dependent-events',
    prerequisites: ['compound-events'],
    column: 3,
    lane: -1,
  },
  // L5 — upper-right end of the slope (highest point).
  'mutually-exclusive-events': {
    lessonId: 'mutually-exclusive-events',
    prerequisites: ['dependent-events'],
    column: 4,
    lane: -2,
  },
};

/**
 * Prerequisites for a lesson. Lessons with no graph entry default to *no*
 * prerequisites (immediately available) — the conservative choice that shows
 * content rather than permanently locking an unknown lesson out of the path.
 */
export function getPrerequisites(lessonId: string): string[] {
  return courseGraph[lessonId]?.prerequisites ?? [];
}

export function getCourseGraphNode(lessonId: string): CourseGraphNode | undefined {
  return courseGraph[lessonId];
}

/**
 * Every lessonId in strict course-graph order: ascending `column` (the position
 * along the linear trail). This is the canonical sequential order of the course,
 * independent of the learner's progress.
 */
export function courseGraphOrder(): string[] {
  return Object.values(courseGraph)
    .slice()
    .sort((a, b) => a.column - b.column)
    .map((node) => node.lessonId);
}

/**
 * The lesson immediately after `lessonId` on the linear course path, or `null`
 * when `lessonId` is the final lesson (or is not part of the graph). Unlike
 * `resolveContinueDestination`, this is purely positional — it always returns
 * the next sequential lesson regardless of completion/mastery state.
 */
export function getNextLessonId(lessonId: string): string | null {
  const order = courseGraphOrder();
  const index = order.indexOf(lessonId);
  if (index === -1 || index === order.length - 1) return null;
  return order[index + 1];
}

export interface CourseGraphEdge {
  /** Prerequisite lesson (source of the arrow). */
  from: string;
  /** Lesson that the prerequisite unlocks (target of the arrow). */
  to: string;
}

/** Every prerequisite relationship as a directed `from → to` edge, for drawing the map. */
export function courseGraphEdges(): CourseGraphEdge[] {
  const edges: CourseGraphEdge[] = [];
  Object.values(courseGraph).forEach((node) => {
    node.prerequisites.forEach((from) => edges.push({ from, to: node.lessonId }));
  });
  return edges;
}

/** The highest column index used by the graph (the number of "stages" minus one). */
export function maxColumn(): number {
  return Object.values(courseGraph).reduce((max, node) => Math.max(max, node.column), 0);
}
