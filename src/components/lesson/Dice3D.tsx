import { Box, Typography } from '@mui/material';
import { useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** Highlight treatment for a single face. */
export type FaceStyle = 'a' | 'b' | 'both';

export interface Dice3DProps {
  /** Faces (1–6) to highlight with the primary "lit" treatment. */
  litFaces?: number[];
  /**
   * Optional per-face style map for multi-event demos. Takes precedence over
   * `litFaces` for any face it lists. 'a' = event A, 'b' = event B, 'both' =
   * the overlap that belongs to both events.
   */
  faceStyles?: Record<number, FaceStyle>;
  /**
   * Pixel size of the cube (width/height/depth). When `responsive` is set this
   * acts as the maximum size and the die scales down to fit its container.
   */
  size?: number;
  /**
   * Fill the available container width (up to `size`) and scale down to
   * `minSize` on narrow layouts instead of staying a fixed pixel size.
   */
  responsive?: boolean;
  /** Smallest pixel size the responsive die will shrink to. */
  minSize?: number;
  /** Allow drag/keyboard rotation. Defaults to true. */
  interactive?: boolean;
  /** Which face (1–6) starts roughly facing the viewer. */
  initialFace?: number;
  /**
   * While true, the die continuously tumbles to convey an in-progress roll.
   * When it flips back to false the die settles onto `initialFace`.
   */
  rolling?: boolean;
  /** Accessible label prefix; lit-face details are appended automatically. */
  label?: string;
  /** Show the small "drag to rotate" affordance. Defaults to `interactive`. */
  showHint?: boolean;
  /**
   * Duration of one tumble cycle while `rolling`. Defaults to 720ms. Callers can
   * vary this per die so a group of dice does not tumble in lockstep.
   */
  rollDurationMs?: number;
  /** Negative-friendly start offset (ms) for the tumble so dice desync. */
  rollDelayMs?: number;
  /**
   * Small integer that shifts the tumble keyframe (rotation magnitude/direction)
   * so each die follows a slightly different path. Cosmetic only.
   */
  rollSeed?: number;
}

// Pip layout per face value, as a 3x3 grid read left-to-right, top-to-bottom.
// Exported so lightweight (non-3D) die renderers can reuse the same pip art.
export const PIP_LAYOUTS: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

// Cube face placement. Opposite faces sum to 7 (1↔6, 2↔5, 3↔4).
const FACE_TRANSFORMS: Record<number, string> = {
  1: 'rotateY(0deg)',
  6: 'rotateY(180deg)',
  3: 'rotateY(90deg)',
  4: 'rotateY(-90deg)',
  2: 'rotateX(90deg)',
  5: 'rotateX(-90deg)',
};

// Base rotation that brings a given face to the front of the viewer.
const FACE_TO_FRONT: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  2: { x: -90, y: 0 },
  5: { x: 90, y: 0 },
};

// A gentle tilt layered on top of the base orientation so ~3 faces are visible.
const TILT = { x: -18, y: -26 };

const PURPLE = '#6f3fc4';

function faceVisual(value: number, litFaces: number[], faceStyles?: Record<number, FaceStyle>) {
  const style = faceStyles?.[value];
  if (style === 'both') {
    return { bg: PURPLE, pip: '#ffffff', border: '#52299b', glow: 'rgba(111,63,196,0.55)' };
  }
  if (style === 'a') {
    return { bg: '#0f6f68', pip: '#fffaf0', border: '#084f4a', glow: 'rgba(15,111,104,0.5)' };
  }
  if (style === 'b') {
    return { bg: '#c35f2c', pip: '#fffaf0', border: '#8f3f17', glow: 'rgba(195,95,44,0.5)' };
  }
  if (litFaces.includes(value)) {
    return { bg: '#0f6f68', pip: '#fffaf0', border: '#084f4a', glow: 'rgba(15,111,104,0.55)' };
  }
  return { bg: '#fffaf0', pip: '#1f2430', border: 'rgba(31,36,48,0.18)', glow: 'transparent' };
}

function describeFaces(litFaces: number[], faceStyles?: Record<number, FaceStyle>) {
  if (faceStyles && Object.keys(faceStyles).length > 0) {
    const a = Object.entries(faceStyles).filter(([, v]) => v === 'a').map(([k]) => k);
    const b = Object.entries(faceStyles).filter(([, v]) => v === 'b').map(([k]) => k);
    const both = Object.entries(faceStyles).filter(([, v]) => v === 'both').map(([k]) => k);
    const parts: string[] = [];
    if (a.length) parts.push(`event A: ${a.join(', ')}`);
    if (b.length) parts.push(`event B: ${b.join(', ')}`);
    if (both.length) parts.push(`both events: ${both.join(', ')}`);
    return parts.length ? parts.join('; ') : 'no highlighted faces';
  }
  const sorted = [...litFaces].sort((l, r) => l - r);
  return sorted.length ? `Highlighted faces: ${sorted.join(', ')}` : 'no highlighted faces';
}

export function Dice3D({
  litFaces = [],
  faceStyles,
  size = 104,
  responsive = false,
  minSize = 104,
  interactive = true,
  initialFace = 1,
  rolling = false,
  label = '3D die',
  showHint,
  rollDurationMs = 720,
  rollDelayMs = 0,
  rollSeed = 0,
}: Dice3DProps) {
  const prefersReducedMotion = useReducedMotion();
  const base = FACE_TO_FRONT[initialFace] ?? FACE_TO_FRONT[1];
  const [rotation, setRotation] = useState({ x: base.x + TILT.x, y: base.y + TILT.y });
  const [dragging, setDragging] = useState(false);
  const [prevFace, setPrevFace] = useState(initialFace);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Imperative-drag plumbing: during a drag we mutate the cube's transform
  // directly (throttled by requestAnimationFrame) instead of calling
  // setRotation on every pointermove. That keeps dragging at the browser's
  // compositor frame rate with zero React re-renders. `rotationRef` is the live
  // source of truth while dragging; we commit it back to state on release so
  // the resting orientation is byte-for-byte identical to the old behavior.
  const cubeRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(rotation);
  const halfRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Responsive sizing: measure the wrapper and clamp the die between `minSize`
  // and `size` so it fills the card cleanly on wide screens and scales down
  // (rather than overflowing) on narrow ones.
  const containerRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);

  useEffect(() => {
    if (!responsive) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setMeasured(Math.round(Math.max(minSize, Math.min(size, width))));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [responsive, size, minSize]);

  const px = responsive ? measured ?? size : size;

  // Re-orient to show the latest `initialFace` when it changes (e.g. a new roll),
  // unless the user is mid-drag. Picks the nearest equivalent y rotation so the
  // cube turns the short way rather than unwinding multiple turns.
  if (prevFace !== initialFace && !dragging) {
    setPrevFace(initialFace);
    const target = FACE_TO_FRONT[initialFace] ?? FACE_TO_FRONT[1];
    const desiredY = target.y + TILT.y;
    const desiredX = target.x + TILT.x;
    setRotation((prev) => {
      const turns = Math.round((prev.y - desiredY) / 360);
      return { x: desiredX, y: desiredY + turns * 360 };
    });
  }

  const half = px / 2;
  halfRef.current = half;
  const pipDot = Math.max(7, Math.round(px * 0.13));
  const hintVisible = showHint ?? interactive;
  const isRolling = rolling && !prefersReducedMotion;
  // Unique keyframe name per size + tumble variation so emotion registers a
  // distinct @keyframes for each path instead of clobbering a shared name.
  const rollKey = `dice3dRoll_${Math.round(px)}_${rollSeed}_${Math.round(rollDurationMs)}`;
  const spinDir = rollSeed % 2 === 0 ? 1 : -1;
  const extraX = (rollSeed % 4) * 60;
  const extraY = (rollSeed % 3) * 50;

  // Keep the live rotation ref aligned with React state whenever state changes
  // for a non-drag reason (keyboard nudge, settle onto a new face, etc.).
  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  // After a drag commits (dragging → false), drop the inline transform we wrote
  // during the drag so the class-based transform (which carries the transition)
  // takes over again. Runs before paint, and the committed state equals the
  // inline value, so there is no flicker.
  useLayoutEffect(() => {
    if (!dragging && cubeRef.current) {
      cubeRef.current.style.transform = '';
    }
  }, [dragging, rotation]);

  const ariaLabel = `${label}. ${describeFaces(litFaces, faceStyles)}.`;

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive) return;
      dragRef.current = { x: event.clientX, y: event.clientY };
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [interactive],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive || !dragRef.current) return;
      const dx = event.clientX - dragRef.current.x;
      const dy = event.clientY - dragRef.current.y;
      dragRef.current = { x: event.clientX, y: event.clientY };
      // Accumulate into the ref (same math as the old setRotation updater) and
      // flush at most once per animation frame straight to the DOM — no React
      // state update, so dragging never triggers a re-render.
      const next = { x: rotationRef.current.x - dy * 0.6, y: rotationRef.current.y + dx * 0.6 };
      rotationRef.current = next;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const el = cubeRef.current;
          if (el) {
            const { x, y } = rotationRef.current;
            el.style.transform = `translateZ(-${halfRef.current}px) rotateX(${x}deg) rotateY(${y}deg)`;
          }
        });
      }
    },
    [interactive],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Commit the dragged orientation back to React state so the rest of the
    // component (settle transitions, face re-orient on a new roll) stays in sync.
    setRotation(rotationRef.current);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!interactive) return;
      const step = 18;
      switch (event.key) {
        case 'ArrowLeft':
          setRotation((p) => ({ ...p, y: p.y - step }));
          break;
        case 'ArrowRight':
          setRotation((p) => ({ ...p, y: p.y + step }));
          break;
        case 'ArrowUp':
          setRotation((p) => ({ ...p, x: p.x + step }));
          break;
        case 'ArrowDown':
          setRotation((p) => ({ ...p, x: p.x - step }));
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [interactive],
  );

  // Build the six faces once per visual change (size / highlights), not per
  // render. During a drag none of these inputs change, so the faces — with
  // their gradients and box-shadows — are never rebuilt mid-rotation.
  const litKey = litFaces.join(',');
  const styleKey = faceStyles ? JSON.stringify(faceStyles) : '';
  const faceNodes = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6].map((value) => {
        const visual = faceVisual(value, litFaces, faceStyles);
        const lit = visual.glow !== 'transparent';
        return (
          <Box
            key={value}
            aria-hidden
            sx={{
              position: 'absolute',
              width: px,
              height: px,
              top: 0,
              left: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(3, 1fr)',
              p: `${px * 0.12}px`,
              boxSizing: 'border-box',
              borderRadius: `${px * 0.16}px`,
              backgroundColor: visual.bg,
              border: '2px solid',
              borderColor: visual.border,
              boxShadow: lit
                ? `inset 0 0 ${px * 0.18}px ${visual.glow}, 0 0 ${px * 0.12}px ${visual.glow}`
                : 'inset 0 0 12px rgba(0,0,0,0.08)',
              transform: `${FACE_TRANSFORMS[value]} translateZ(${half}px)`,
            }}
          >
            {PIP_LAYOUTS[value].map((filled, index) => (
              <Box key={index} sx={{ display: 'grid', placeItems: 'center' }}>
                {filled && (
                  <Box
                    sx={{
                      width: pipDot,
                      height: pipDot,
                      borderRadius: '50%',
                      backgroundColor: visual.pip,
                      boxShadow: lit ? '0 0 4px rgba(0,0,0,0.25)' : 'inset 0 -1px 2px rgba(0,0,0,0.35)',
                    }}
                  />
                )}
              </Box>
            ))}
          </Box>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [px, half, pipDot, litKey, styleKey],
  );

  return (
    <Box
      ref={containerRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.75,
        width: responsive ? '100%' : 'auto',
      }}
    >
      <Box
        role="img"
        aria-label={ariaLabel}
        tabIndex={interactive ? 0 : -1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        sx={{
          width: px,
          height: px,
          perspective: px * 4,
          touchAction: 'none',
          cursor: interactive ? (dragging ? 'grabbing' : 'grab') : 'default',
          outline: 'none',
          '&:focus-visible': { boxShadow: '0 0 0 3px rgba(15,111,104,0.45)', borderRadius: 2 },
        }}
      >
        <Box
          ref={cubeRef}
          sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            willChange: 'transform',
            transform: `translateZ(-${half}px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            transition: dragging || prefersReducedMotion ? 'none' : 'transform 220ms ease',
            animation: isRolling
              ? `${rollKey} ${rollDurationMs}ms cubic-bezier(0.45, 0.05, 0.55, 0.95) ${rollDelayMs}ms infinite`
              : 'none',
            [`@keyframes ${rollKey}`]: {
              '0%': { transform: `translateZ(-${half}px) rotateX(0deg) rotateY(0deg)` },
              '50%': {
                transform: `translateZ(-${half}px) rotateX(${spinDir * (360 + extraX)}deg) rotateY(${200 + extraY}deg)`,
              },
              '100%': {
                transform: `translateZ(-${half}px) rotateX(${spinDir * (720 + extraX)}deg) rotateY(360deg)`,
              },
            },
          }}
        >
          {faceNodes}
        </Box>
      </Box>
      {hintVisible && (
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, userSelect: 'none' }}>
          {isRolling ? 'Rolling…' : 'Drag to rotate'}
        </Typography>
      )}
    </Box>
  );
}

export default Dice3D;
