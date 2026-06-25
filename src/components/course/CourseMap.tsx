import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { LessonNodeState } from '../../services/lessonProgression';
import { getMasteryLabel } from '../../services/masteryLabels';
import { courseGraphEdges, getCourseGraphNode } from '../../services/courseGraph';

interface CourseMapProps {
  states: LessonNodeState[];
}

const NODE_SIZE = 96;
// Each node renders a label card this wide, centered on the node. It therefore extends
// LABEL_WIDTH / 2 past the node center on either side, which the edge padding must absorb
// so the first and last cards are never clipped by the container edge.
const LABEL_WIDTH = NODE_SIZE + 56;
const LABEL_HALF_WIDTH = LABEL_WIDTH / 2;
// Breathing room kept between a label card edge and the content edge.
const EDGE_MARGIN = 24;
// Minimum spacing between columns. The path stretches to fill the viewport, and only
// scrolls horizontally when the viewport is too narrow to fit every stage at this gap.
const MIN_HORIZONTAL_GAP = 188;
const LEFT_PADDING = 120;
// Larger than LEFT_PADDING so the last column is pulled inward and its (wider-than-the-circle)
// label card clears the right edge instead of overflowing. Must stay >= LABEL_HALF_WIDTH + EDGE_MARGIN.
const RIGHT_PADDING = 200;
const FALLBACK_HEIGHT = 520;

interface Point {
  x: number;
  y: number;
}

/**
 * Smooth curved connector between two consecutive node centers. The trail
 * slopes upward overall, but each segment is a gentle cubic bezier with
 * horizontal tangents at both ends, so the path flows in soft S-curves rather
 * than rigid straight diagonals while still passing exactly through each node.
 */
function edgePath(from: Point, to: Point): string {
  const dx = (to.x - from.x) * 0.5;
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

function LockIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" fill="currentColor" />
      <path
        d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="15" r="1.6" fill="#fffaf0" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9l-5.8 3.07 1.1-6.47L2.6 9.95l6.5-.95L12 2.5z" />
    </svg>
  );
}

function nodeVisual(state: LessonNodeState) {
  if (!state.unlocked) {
    return {
      gradient: 'linear-gradient(160deg, #cdd3dc 0%, #aab2bf 100%)',
      ring: 'rgba(120,130,145,0.35)',
      icon: <LockIcon />,
      iconColor: '#f4f6f9',
      labelColor: 'text.secondary',
    };
  }
  if (state.status === 'mastered') {
    return {
      gradient: 'linear-gradient(160deg, #ffd86b 0%, #f5a623 100%)',
      ring: 'rgba(245,166,35,0.45)',
      icon: <StarIcon />,
      iconColor: '#7a4a00',
      labelColor: 'text.primary',
    };
  }
  if (state.completed) {
    return {
      gradient: 'linear-gradient(160deg, #43c59e 0%, #1f9d74 100%)',
      ring: 'rgba(31,157,116,0.4)',
      icon: <CheckIcon />,
      iconColor: '#eafff6',
      labelColor: 'text.primary',
    };
  }
  // Unlocked, in-progress or not-yet-started.
  return {
    gradient: 'linear-gradient(160deg, #18867e 0%, #0f6f68 100%)',
    ring: 'rgba(15,111,104,0.4)',
    icon: (
      <Typography component="span" className="numeric" sx={{ fontWeight: 900, fontSize: 34, color: '#fffaf0' }}>
        {state.index + 1}
      </Typography>
    ),
    iconColor: '#fffaf0',
    labelColor: 'text.primary',
  };
}

function lockedTooltip(state: LessonNodeState): string {
  const blockers = state.incompletePrerequisites.length ? state.incompletePrerequisites : state.prerequisites;
  if (blockers.length === 0) return 'Locked';
  const titles = blockers.map((lesson) => `"${lesson.title}"`);
  const joined =
    titles.length === 1
      ? titles[0]
      : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
  return `Locked — finish ${joined} to unlock`;
}

export default function CourseMap({ states }: CourseMapProps) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [mapHeight, setMapHeight] = useState(0);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => {
      setViewportWidth(element.clientWidth);
      setMapHeight(element.clientHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const height = mapHeight || FALLBACK_HEIGHT;

  // Resolve each lesson's column AND lane from the graph; lessons missing a
  // graph entry fall back to a fresh column at mid height so nothing collides.
  // The lane drives the slope: lanes decrease each step so the trail rises.
  const layout = useMemo(() => {
    return states.map((state, index) => {
      const node = getCourseGraphNode(state.lesson.lessonId);
      return {
        column: node?.column ?? index,
        lane: node?.lane ?? 0,
      };
    });
  }, [states]);

  const numColumns = useMemo(
    () => layout.reduce((max, item) => Math.max(max, item.column), 0) + 1,
    [layout]
  );

  const intrinsicWidth = LEFT_PADDING + RIGHT_PADDING + Math.max(numColumns - 1, 0) * MIN_HORIZONTAL_GAP;
  // Stretch to fill the viewport when there are few stages; scroll when there are many.
  const contentWidth = Math.max(intrinsicWidth, viewportWidth);
  const columnGap = numColumns > 1 ? (contentWidth - LEFT_PADDING - RIGHT_PADDING) / (numColumns - 1) : 0;

  // Keep every node's label card fully inside the content box: a node center can sit no
  // closer to either edge than half a label card plus a little breathing room.
  const minX = LABEL_HALF_WIDTH + EDGE_MARGIN;
  const maxX = Math.max(contentWidth - LABEL_HALF_WIDTH - EDGE_MARGIN, minX);

  // Vertical fit for the sloped trail. The highest node must clear the top
  // (circle + pulsing halo) and the lowest node must clear the bottom (circle +
  // the label card that hangs below each node), so we reserve that space and
  // map the lane span into whatever vertical room is left.
  const verticalFit = useMemo(() => {
    const lanes = layout.map((item) => item.lane);
    const minLane = Math.min(0, ...lanes); // most negative = highest peak
    const maxLane = Math.max(0, ...lanes); // most positive = lowest valley
    const laneSpan = maxLane - minLane || 1;

    const TOP_EXTENT = NODE_SIZE / 2 + 20; // node radius + halo breathing room
    const BOTTOM_EXTENT = NODE_SIZE / 2 + 104; // node radius + label card below it
    const VERTICAL_MARGIN = 14;

    const availableRange = Math.max(height - TOP_EXTENT - BOTTOM_EXTENT - 2 * VERTICAL_MARGIN, 0);
    // Cap the per-lane pixel size so a tall container doesn't stretch the
    // zigzag into something gangly; centre the whole shape in leftover space.
    const laneUnit = Math.min(availableRange / laneSpan, 78);
    const usedHeight = laneSpan * laneUnit + TOP_EXTENT + BOTTOM_EXTENT;
    const topOffset = Math.max((height - usedHeight) / 2, VERTICAL_MARGIN) + TOP_EXTENT;

    // A node's y grows with (lane - minLane): the highest peak sits at the top.
    const laneToY = (lane: number) => topOffset + (lane - minLane) * laneUnit;
    return { laneToY };
  }, [layout, height]);

  const points = useMemo<Point[]>(
    () =>
      layout.map((item) => ({
        x: Math.min(Math.max(LEFT_PADDING + item.column * columnGap, minX), maxX),
        y: verticalFit.laneToY(item.lane),
      })),
    [layout, columnGap, minX, maxX, verticalFit]
  );

  const pointByLessonId = useMemo(() => {
    const map = new Map<string, Point>();
    states.forEach((state, index) => map.set(state.lesson.lessonId, points[index]));
    return map;
  }, [states, points]);

  const completedByLessonId = useMemo(() => {
    const map = new Map<string, boolean>();
    states.forEach((state) => map.set(state.lesson.lessonId, state.completed));
    return map;
  }, [states]);

  // Draw one curve per (linear) prerequisite edge, joining each lesson to the
  // next. An edge reads as "travelled" (and is painted in the progress colour)
  // once its source lesson is completed.
  const edges = useMemo(() => {
    return courseGraphEdges()
      .map((edge) => {
        const from = pointByLessonId.get(edge.from);
        const to = pointByLessonId.get(edge.to);
        if (!from || !to) return null;
        return {
          key: `${edge.from}->${edge.to}`,
          d: edgePath(from, to),
          travelled: completedByLessonId.get(edge.from) === true,
        };
      })
      .filter((edge): edge is { key: string; d: string; travelled: boolean } => edge !== null);
  }, [pointByLessonId, completedByLessonId]);

  // The node the viewport should center on: the recommended next lesson, else
  // the furthest completed lesson, else the first node.
  const focusIndex = useMemo(() => {
    const currentIndex = states.findIndex((state) => state.isCurrent);
    if (currentIndex !== -1) return currentIndex;
    let lastCompleted = -1;
    states.forEach((state, index) => {
      if (state.completed) lastCompleted = index;
    });
    return lastCompleted === -1 ? 0 : lastCompleted;
  }, [states]);

  // Center the focus lesson in the viewport when the map can scroll.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || points.length === 0) return;
    const target = points[focusIndex];
    if (!target) return;
    const desired = target.x - element.clientWidth / 2;
    element.scrollLeft = Math.max(0, Math.min(desired, contentWidth - element.clientWidth));
  }, [points, focusIndex, contentWidth]);

  return (
    <Box
      ref={scrollRef}
      sx={{
        position: 'relative',
        borderRadius: 5,
        overflowX: 'auto',
        overflowY: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 18px 55px rgba(68,50,23,0.12)',
        border: '1px solid rgba(15,111,104,0.12)',
        WebkitOverflowScrolling: 'touch',
        height: { xs: 460, md: 'calc(100vh - 250px)' },
        minHeight: { xs: 460, md: 480 },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: contentWidth,
          height,
          background: 'linear-gradient(180deg, #fff3d6 0%, #ffe9c2 18%, #d9f0e4 55%, #bfe6d2 100%)',
        }}
      >
        {/* Sun */}
        <Box
          component="svg"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <circle cx="9" cy="14" r="6" fill="#ffd277" opacity="0.85" />
          <circle cx="9" cy="14" r="9.5" fill="#ffd277" opacity="0.25" />
        </Box>

        {/* Rolling hills anchored to the bottom */}
        <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%', zIndex: 0 }}>
          <Box
            component="svg"
            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path d="M0 22 Q 25 8 50 18 T 100 14 V40 H0 Z" fill="#a6dcc1" opacity="0.7" />
            <path d="M0 30 Q 30 16 60 26 T 100 24 V40 H0 Z" fill="#7fcaa6" opacity="0.75" />
            <path d="M0 37 Q 35 28 70 35 T 100 33 V40 H0 Z" fill="#5cb98f" opacity="0.85" />
          </Box>
        </Box>

        {/* Floating clouds */}
        {[
          { top: 56, left: 180, scale: 1 },
          { top: 96, left: 620, scale: 0.8 },
          { top: 70, left: 1040, scale: 0.9 },
        ].map((cloud, index) => (
          <motion.div
            key={`cloud-${index}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.82, x: [0, 14, 0] }}
            transition={{ opacity: { duration: 0.8 }, x: { duration: 12 + index * 3, repeat: Infinity, ease: 'easeInOut' } }}
            style={{ position: 'absolute', top: cloud.top, left: cloud.left, zIndex: 0, transform: `scale(${cloud.scale})` }}
          >
            <svg width="96" height="40" viewBox="0 0 96 40" fill="#ffffff" opacity={0.78} aria-hidden>
              <ellipse cx="30" cy="26" rx="26" ry="13" />
              <ellipse cx="54" cy="20" rx="22" ry="16" />
              <ellipse cx="72" cy="27" rx="20" ry="12" />
            </svg>
          </motion.div>
        ))}

        {/* The linear trail: one smooth curve per prerequisite edge */}
        <Box
          component="svg"
          width={contentWidth}
          height={height}
          sx={{ position: 'absolute', inset: 0, zIndex: 1 }}
          aria-hidden
        >
          {edges.map((edge) => (
            <g key={edge.key}>
              <path d={edge.d} fill="none" stroke="rgba(99,79,46,0.18)" strokeWidth={18} strokeLinecap="round" />
              <path
                d={edge.d}
                fill="none"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray="2 16"
              />
              {edge.travelled && (
                <motion.path
                  d={edge.d}
                  fill="none"
                  stroke="#f5a623"
                  strokeWidth={12}
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, ease: 'easeInOut' }}
                />
              )}
            </g>
          ))}
        </Box>

        {/* Lesson nodes */}
        {points.map((point, index) => {
          const state = states[index];
          const visual = nodeVisual(state);
          const label = getMasteryLabel(state.status);
          const tooltip = state.unlocked ? `${state.lesson.title} - ${label}` : lockedTooltip(state);
          // On a strict linear path the only available lesson is also the
          // recommended ("up next") one, which gets the pulsing halo below. This
          // stays defined for the rare fallback where a lesson has no graph entry.
          const selectable = state.available && !state.isCurrent;

          return (
            <motion.div
              key={state.lesson.lessonId}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * index, type: 'spring', stiffness: 220, damping: 18 }}
              style={{
                position: 'absolute',
                left: point.x,
                top: point.y,
                transform: 'translate(-50%, -50%)',
                zIndex: 2,
                width: NODE_SIZE + 56,
                textAlign: 'center',
              }}
            >
              <Tooltip title={tooltip} arrow placement="top">
                <Box
                  component={state.unlocked ? 'button' : 'div'}
                  onClick={state.unlocked ? () => navigate(`/lesson/${state.lesson.lessonId}`) : undefined}
                  aria-disabled={!state.unlocked}
                  sx={{
                    border: 'none',
                    p: 0,
                    bgcolor: 'transparent',
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: state.unlocked ? 'pointer' : 'not-allowed',
                    outline: 'none',
                  }}
                >
                  <Box sx={{ position: 'relative', width: NODE_SIZE, height: NODE_SIZE }}>
                    {state.isCurrent && (
                      <motion.div
                        animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0.15, 0.55] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                          position: 'absolute',
                          inset: -10,
                          borderRadius: '50%',
                          background: 'radial-gradient(circle, rgba(245,166,35,0.7) 0%, rgba(245,166,35,0) 70%)',
                        }}
                      />
                    )}
                    <Box
                      component={motion.div}
                      whileHover={state.unlocked ? { scale: 1.07, y: -3 } : undefined}
                      whileTap={state.unlocked ? { scale: 0.95 } : undefined}
                      sx={{
                        position: 'relative',
                        width: NODE_SIZE,
                        height: NODE_SIZE,
                        borderRadius: '50%',
                        background: visual.gradient,
                        color: visual.iconColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 10px 22px ${visual.ring}, inset 0 3px 6px rgba(255,255,255,0.45), inset 0 -6px 10px rgba(0,0,0,0.12)`,
                        border: selectable ? '4px solid rgba(245,166,35,0.85)' : '4px solid rgba(255,255,255,0.85)',
                      }}
                    >
                      {visual.icon}
                    </Box>
                  </Box>
                  <Box
                    sx={{
                      mt: 1.25,
                      px: 1.25,
                      py: 0.5,
                      borderRadius: 999,
                      bgcolor: 'rgba(255,253,247,0.92)',
                      boxShadow: '0 4px 12px rgba(68,50,23,0.12)',
                      maxWidth: NODE_SIZE + 56,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 }}
                    >
                      Lesson {state.lesson.order ?? index + 1}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.15, color: visual.labelColor }}>
                      {state.lesson.title}
                    </Typography>
                    {state.available && (
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          mt: 0.25,
                          fontWeight: 800,
                          fontSize: 9.5,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                          color: state.isCurrent ? '#b5701a' : '#0f6f68',
                        }}
                      >
                        {state.isCurrent ? 'Up next' : 'Tap to start'}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Tooltip>
            </motion.div>
          );
        })}
      </Box>
    </Box>
  );
}
