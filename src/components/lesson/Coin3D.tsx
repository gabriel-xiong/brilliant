import { Box, Typography } from '@mui/material';
import { useReducedMotion } from 'framer-motion';
import { useCallback, useMemo, useRef, useState } from 'react';

export type CoinFace = 'Heads' | 'Tails';

export interface Coin3DProps {
  /** Which side faces the viewer. */
  face?: CoinFace;
  /** Pixel diameter of the coin. */
  size?: number;
  /** Allow drag rotation. Defaults to true. */
  interactive?: boolean;
  /** When true, plays a continuous flip animation (an in-progress flip). */
  spinning?: boolean;
  /** Accessible label prefix; the current face is appended automatically. */
  label?: string;
  /** Show the small "drag to rotate" affordance. Defaults to `interactive`. */
  showHint?: boolean;
  /**
   * Sides to highlight with the teal "satisfies the event" treatment. Lets a
   * lab color the coin face(s) that belong to the selected event so the
   * highlight reads even before/after a flip.
   */
  litFaces?: CoinFace[];
}

// Gold/amber palette consistent with the app's warm accents.
const GOLD_FACE = 'radial-gradient(circle at 35% 30%, #fbe7a1 0%, #e8b84b 55%, #b9842a 100%)';
const GOLD_EDGE = 'linear-gradient(#caa23e, #9c7521)';
const RIM_TEXT = '#7c5a16';

// Teal "lit" treatment, matched to Dice3D's highlighted faces.
const TEAL_FACE = 'radial-gradient(circle at 35% 30%, #7fd0c8 0%, #1f8c83 55%, #0f6f68 100%)';
const TEAL_BORDER = '#084f4a';
const TEAL_TEXT = '#fffaf0';
const TEAL_GLOW = 'rgba(15,111,104,0.55)';

const EDGE_SEGMENTS = 40;

export function Coin3D({
  face = 'Heads',
  size = 104,
  interactive = true,
  spinning = false,
  label = '3D coin',
  showHint,
  litFaces = [],
}: Coin3DProps) {
  const prefersReducedMotion = useReducedMotion();
  const baseY = face === 'Tails' ? 180 : 0;
  const [rotation, setRotation] = useState({ x: -16, y: baseY });
  const [dragging, setDragging] = useState(false);
  const [prevFace, setPrevFace] = useState<CoinFace>(face);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // Keep the resting orientation in sync with the controlled `face` prop while
  // letting the user freely drag in between updates.
  if (prevFace !== face && !dragging) {
    setPrevFace(face);
    const desired = face === 'Tails' ? 180 : 0;
    // Snap the y rotation to the nearest equivalent of the desired face so the
    // coin shows the correct side without spinning the long way around.
    setRotation((prev) => {
      const turns = Math.round((prev.y - desired) / 360);
      return { ...prev, y: desired + turns * 360 };
    });
  }

  const thickness = Math.max(8, Math.round(size * 0.1));
  const radius = size / 2;
  const segmentWidth = (Math.PI * size) / EDGE_SEGMENTS + 2;
  const hintVisible = showHint ?? interactive;
  const animate = spinning && !prefersReducedMotion;

  const ariaLabel = `${label}. Showing ${face}.`;

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
      setRotation((prev) => ({ x: prev.x - dy * 0.6, y: prev.y + dx * 0.6 }));
    },
    [interactive],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!interactive) return;
      const step = 22;
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

  const segments = useMemo(() => Array.from({ length: EDGE_SEGMENTS }, (_, i) => i), []);

  const headsLit = litFaces.includes('Heads');
  const tailsLit = litFaces.includes('Tails');

  const faceSx = {
    position: 'absolute' as const,
    width: size,
    height: size,
    top: 0,
    left: 0,
    borderRadius: '50%',
    background: GOLD_FACE,
    border: '3px solid #b9842a',
    boxSizing: 'border-box' as const,
    display: 'grid',
    placeItems: 'center',
    backfaceVisibility: 'hidden' as const,
  };

  const litFaceSx = {
    background: TEAL_FACE,
    border: `3px solid ${TEAL_BORDER}`,
    boxShadow: `inset 0 0 ${size * 0.16}px ${TEAL_GLOW}, 0 0 ${size * 0.1}px ${TEAL_GLOW}`,
  };

  return (
    <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
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
          width: size,
          height: size,
          perspective: size * 4,
          touchAction: 'none',
          cursor: interactive ? (dragging ? 'grabbing' : 'grab') : 'default',
          outline: 'none',
          '&:focus-visible': { boxShadow: '0 0 0 3px rgba(15,111,104,0.45)', borderRadius: '50%' },
        }}
      >
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            transformStyle: 'preserve-3d',
            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            transition: dragging || prefersReducedMotion ? 'none' : 'transform 240ms ease',
            animation: animate ? 'coin3dSpin 900ms linear infinite' : 'none',
            '@keyframes coin3dSpin': {
              '0%': { transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` },
              '100%': { transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y + 360}deg)` },
            },
          }}
        >
          {/* Heads */}
          <Box aria-hidden sx={{ ...faceSx, ...(headsLit ? litFaceSx : {}), transform: `translateZ(${thickness / 2}px)` }}>
            <Box
              component="span"
              sx={{
                fontWeight: 900,
                fontSize: size * 0.42,
                color: headsLit ? TEAL_TEXT : RIM_TEXT,
                textShadow: headsLit ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 1px rgba(255,255,255,0.4)',
                fontFamily: "'Source Sans 3', system-ui, sans-serif",
              }}
            >
              H
            </Box>
          </Box>
          {/* Tails */}
          <Box aria-hidden sx={{ ...faceSx, ...(tailsLit ? litFaceSx : {}), transform: `rotateY(180deg) translateZ(${thickness / 2}px)` }}>
            <Box
              component="span"
              sx={{
                fontWeight: 900,
                fontSize: size * 0.42,
                color: tailsLit ? TEAL_TEXT : RIM_TEXT,
                textShadow: tailsLit ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 1px rgba(255,255,255,0.4)',
                fontFamily: "'Source Sans 3', system-ui, sans-serif",
              }}
            >
              T
            </Box>
          </Box>
          {/* Cylindrical rim built from thin tangential segments. */}
          {segments.map((i) => {
            const angle = (i * 360) / EDGE_SEGMENTS;
            return (
              <Box
                key={i}
                aria-hidden
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: segmentWidth,
                  height: thickness,
                  marginLeft: `-${segmentWidth / 2}px`,
                  marginTop: `-${thickness / 2}px`,
                  background: GOLD_EDGE,
                  transform: `rotateZ(${angle}deg) translateY(-${radius}px) rotateX(90deg)`,
                }}
              />
            );
          })}
        </Box>
      </Box>
      {hintVisible && (
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, userSelect: 'none' }}>
          Drag to rotate
        </Typography>
      )}
    </Box>
  );
}
