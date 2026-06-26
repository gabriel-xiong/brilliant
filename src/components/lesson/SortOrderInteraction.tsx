import { Box, Button, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { LayoutGroup, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import type { InteractiveItem, SortBucket } from '../../models/lesson';
import { parseOrderAnswer, parseSortAnswer, serializeOrderAnswer, serializeSortAnswer } from '../../services/answerCheck';

/**
 * Shared interactive answer widgets for the `sort` and `order` problem formats.
 *
 * Both are answered purely by manipulation — there is no text entry. They are
 * controlled by a serialized `value` string (parsed/produced via the answerCheck
 * helpers) so the lesson player can treat the placement/arrangement exactly like
 * any other submitted answer (grade, restore, reveal).
 *
 * Accessibility / touch: dragging is offered as an enhancement on pointer
 * devices, but every action also has an explicit button equivalent (tap an item
 * then tap a bucket; move items up/down). All controls are real <button>s, so
 * keyboard and screen-reader users — and touch users, for whom native HTML5
 * drag does not fire — can complete every interaction without dragging.
 *
 * Motion: items lift on grab, drop targets highlight, the ordering list animates
 * rows to their new positions, and a correct/incorrect submission gets a brief
 * pop or shake. Every motion is gated on `prefers-reduced-motion`; with it on,
 * the same information is conveyed by color/border alone.
 */

// --- Stable scramble ----------------------------------------------------------

/** Deterministic FNV-1a hash → 32-bit unsigned seed. */
function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Small seeded PRNG (mulberry32) so shuffles are stable and repeatable. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Produce a STABLE scrambled ordering of `ids`, seeded by `seed` (e.g. the step
 * id) so it never reshuffles across re-renders, restore, reveal, or reload.
 *
 * Guarantees the result does not already equal `solution`: if a shuffle happens
 * to land solved it reshuffles a bounded number of times, then rotates by one as
 * a final fallback (which is guaranteed to differ from the solution when ids are
 * distinct and there are at least two of them). Degenerate sets (0–1 items) are
 * returned unchanged.
 */
export function scrambleOrderIds(ids: string[], solution: string[], seed: string): string[] {
  if (ids.length <= 1) return [...ids];
  const rng = mulberry32(hashSeed(seed));
  const arr = [...ids];
  const shuffleOnce = () => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };
  shuffleOnce();
  let guard = 0;
  while (solution.length === arr.length && sameOrder(arr, solution) && guard < 12) {
    shuffleOnce();
    guard += 1;
  }
  if (solution.length === arr.length && sameOrder(arr, solution)) {
    return [...arr.slice(1), arr[0]];
  }
  return arr;
}

// --- Shared motion/styling ----------------------------------------------------

/** ease-out-quart — smooth, refined deceleration (no bounce). */
const EASE = [0.25, 1, 0.5, 1] as const;

const MotionBox = motion(Box);
const MotionButton = motion(Button);

/** Feedback signal driving the correct-pop / incorrect-shake micro-interaction. */
export type InteractionFeedback = 'correct' | 'incorrect' | null;

const CHIP_SX = {
  px: 1.5,
  py: 0.75,
  borderRadius: 2,
  border: '1px solid',
  fontWeight: 700,
  lineHeight: 1.25,
  textTransform: 'none',
  minHeight: 40,
} as const;

const GREEN_GLOW = '0 0 0 2px rgba(46,125,50,0.55), 0 4px 12px rgba(46,125,50,0.22)';

/** A small grab affordance (six dots) so items read as draggable. */
function GripDots({ tone = 'text.disabled' }: { tone?: string }) {
  return (
    <Box
      aria-hidden
      component="span"
      sx={{
        display: 'inline-grid',
        gridTemplateColumns: 'repeat(2, 3px)',
        gap: '3px',
        mr: 0.75,
        flexShrink: 0,
      }}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <Box key={index} sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: tone }} />
      ))}
    </Box>
  );
}

/**
 * Drive the whole-widget pop (correct) / shake (incorrect) cue. Returns the
 * animation controls to spread onto the wrapping motion element. Honors reduced
 * motion by becoming a no-op (the color/border cues still apply).
 */
function useFeedbackMotion(feedback: InteractionFeedback, reduce: boolean | null) {
  const controls = useAnimationControls();
  useEffect(() => {
    if (reduce) {
      controls.set({ x: 0, scale: 1 });
      return;
    }
    if (feedback === 'incorrect') {
      controls.start({ x: [0, -7, 7, -5, 5, 0], transition: { duration: 0.4, ease: 'easeInOut' } });
    } else if (feedback === 'correct') {
      controls.start({ scale: [1, 1.015, 1], transition: { duration: 0.42, ease: EASE } });
    } else {
      controls.set({ x: 0, scale: 1 });
    }
  }, [feedback, reduce, controls]);
  return controls;
}

// --- Sort ---------------------------------------------------------------------

interface SortInteractionProps {
  items: InteractiveItem[];
  buckets: SortBucket[];
  /** Serialized placement (item id → bucket id). Empty string = nothing placed. */
  value: string;
  onChange: (serialized: string) => void;
  disabled?: boolean;
  feedback?: InteractionFeedback;
}

export function SortInteraction({ items, buckets, value, onChange, disabled = false, feedback = null }: SortInteractionProps) {
  const assignment = parseSortAnswer(value);
  // Which item is "picked up" for the tap-to-place fallback (and keyboard).
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  // Native-drag tracking, only for pointer affordances (highlight/dim/lift).
  const [draggingItem, setDraggingItem] = useState<string | null>(null);
  const [overBucket, setOverBucket] = useState<string | null>(null);
  const [overTray, setOverTray] = useState(false);

  const reduce = useReducedMotion();
  const controls = useFeedbackMotion(feedback, reduce);

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const unplaced = items.filter((item) => !assignment[item.id]);
  const correct = feedback === 'correct';
  const incorrect = feedback === 'incorrect';
  // A drop is possible while an item is "in hand" (tapped or dragged).
  const dropActive = !disabled && (selectedItem !== null || draggingItem !== null);

  const place = (itemId: string, bucketId: string) => {
    if (disabled) return;
    onChange(serializeSortAnswer({ ...assignment, [itemId]: bucketId }));
    setSelectedItem(null);
  };

  const unplace = (itemId: string) => {
    if (disabled) return;
    const next = { ...assignment };
    delete next[itemId];
    onChange(serializeSortAnswer(next));
    setSelectedItem(null);
  };

  const toggleSelect = (itemId: string) => {
    if (disabled) return;
    setSelectedItem((current) => (current === itemId ? null : itemId));
  };

  const clearDrag = () => {
    setDraggingItem(null);
    setOverBucket(null);
    setOverTray(false);
  };

  const onDropToBucket = (bucketId: string) => (event: React.DragEvent) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData('text/plain');
    if (itemId) place(itemId, bucketId);
    clearDrag();
  };

  const onDropToTray = (event: React.DragEvent) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData('text/plain');
    if (itemId) unplace(itemId);
    clearDrag();
  };

  const renderItem = (item: InteractiveItem, placed: boolean) => {
    const isSelected = selectedItem === item.id;
    const isDragging = draggingItem === item.id;
    return (
      <MotionButton
        key={item.id}
        layout={!reduce}
        layoutId={reduce ? undefined : `sort-${item.id}`}
        initial={reduce ? false : { scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: isDragging ? 0.55 : 1 }}
        transition={{ duration: 0.2, ease: EASE }}
        whileHover={disabled || reduce ? undefined : { y: -2 }}
        whileTap={disabled ? undefined : { scale: 0.95 }}
        type="button"
        disableElevation
        draggable={!disabled}
        onDragStartCapture={(event: React.DragEvent) => {
          event.dataTransfer.setData('text/plain', item.id);
          event.dataTransfer.effectAllowed = 'move';
          setDraggingItem(item.id);
        }}
        onDragEndCapture={clearDrag}
        aria-pressed={isSelected}
        onClick={() => (placed ? unplace(item.id) : toggleSelect(item.id))}
        disabled={disabled}
        sx={{
          ...CHIP_SX,
          cursor: disabled ? 'default' : 'grab',
          borderColor: isSelected ? 'primary.main' : placed ? 'success.main' : 'divider',
          bgcolor: isSelected ? 'rgba(15,111,104,0.12)' : placed ? 'rgba(46,125,50,0.08)' : 'background.paper',
          color: 'text.primary',
          boxShadow: placed && correct ? GREEN_GLOW : '0 1px 3px rgba(31,36,48,0.12)',
          transition: 'box-shadow 200ms ease, border-color 160ms ease',
          '&:active': { cursor: 'grabbing' },
          '&:hover': { bgcolor: isSelected ? 'rgba(15,111,104,0.16)' : 'action.hover' },
        }}
      >
        {!disabled && <GripDots tone={isSelected ? 'primary.main' : 'text.disabled'} />}
        {item.label}
        {placed && !disabled && (
          <Box component="span" aria-hidden sx={{ ml: 0.75, fontWeight: 900, color: 'text.secondary' }}>
            ✕
          </Box>
        )}
      </MotionButton>
    );
  };

  return (
    <LayoutGroup>
      <MotionBox animate={controls}>
        {/* Unplaced tray */}
        <Box
          onDragOver={(event) => {
            event.preventDefault();
            setOverTray(true);
          }}
          onDragLeave={() => setOverTray(false)}
          onDrop={onDropToTray}
          sx={{
            p: 1.5,
            mb: 2,
            borderRadius: 3,
            border: '1px dashed',
            borderColor: overTray && draggingItem ? 'primary.main' : 'divider',
            bgcolor: overTray && draggingItem ? 'rgba(15,111,104,0.06)' : 'action.hover',
            minHeight: 64,
            transition: 'border-color 150ms ease, background-color 150ms ease',
          }}
        >
          <Typography variant="caption" sx={{ display: 'block', mb: 1, fontWeight: 700, color: 'text.secondary' }}>
            {unplaced.length > 0
              ? selectedItem
                ? 'Now choose a box below to place it.'
                : 'Drag — or tap an item, then tap a box.'
              : 'All items placed. Check your answer below.'}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {unplaced.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                —
              </Typography>
            ) : (
              unplaced.map((item) => renderItem(item, false))
            )}
          </Stack>
        </Box>

        {/* Buckets */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 1.5,
          }}
        >
          {buckets.map((bucket) => {
            const placedItems = items.filter((item) => assignment[item.id] === bucket.id);
            const isOver = dropActive && overBucket === bucket.id;
            // While hovering one bucket during a drag, gently dim the others.
            const dimmed = Boolean(draggingItem) && overBucket !== null && overBucket !== bucket.id;
            return (
              <MotionBox
                key={bucket.id}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={`Place selected item into ${bucket.label}`}
                animate={reduce ? undefined : { scale: isOver ? 1.02 : 1 }}
                transition={{ duration: 0.16, ease: EASE }}
                onDragOver={(event: React.DragEvent) => {
                  event.preventDefault();
                  setOverBucket(bucket.id);
                }}
                onDragLeave={() => setOverBucket((current) => (current === bucket.id ? null : current))}
                onDrop={onDropToBucket(bucket.id)}
                onClick={() => selectedItem && place(selectedItem, bucket.id)}
                onKeyDown={(event: React.KeyboardEvent) => {
                  if ((event.key === 'Enter' || event.key === ' ') && selectedItem) {
                    event.preventDefault();
                    place(selectedItem, bucket.id);
                  }
                }}
                sx={{
                  p: 1.5,
                  borderRadius: 3,
                  border: '2px solid',
                  borderColor: isOver ? 'primary.main' : dropActive ? 'rgba(15,111,104,0.4)' : 'divider',
                  bgcolor: isOver ? 'rgba(15,111,104,0.1)' : dropActive ? 'rgba(15,111,104,0.03)' : 'background.paper',
                  opacity: dimmed ? 0.6 : 1,
                  cursor: dropActive ? 'pointer' : 'default',
                  boxShadow: isOver ? '0 8px 22px rgba(15,111,104,0.18)' : 'none',
                  transition: 'border-color 150ms ease, background-color 150ms ease, opacity 150ms ease, box-shadow 150ms ease',
                  outlineOffset: 2,
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {bucket.label}
                </Typography>
                {bucket.hint && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    {bucket.hint}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 0.75, minHeight: 44 }}>
                  {placedItems.length === 0 ? (
                    <Typography variant="caption" color={isOver ? 'primary.main' : 'text.disabled'} sx={{ alignSelf: 'center', fontWeight: isOver ? 700 : 400 }}>
                      {isOver ? 'Release to place' : 'Drop here'}
                    </Typography>
                  ) : (
                    placedItems.map((item) => renderItem(itemsById.get(item.id) ?? item, true))
                  )}
                </Stack>
              </MotionBox>
            );
          })}
        </Box>
        {incorrect && (
          <Box aria-hidden sx={{ height: 3, mt: 1.5, borderRadius: 999, bgcolor: 'rgba(211,47,47,0.5)' }} />
        )}
      </MotionBox>
    </LayoutGroup>
  );
}

// --- Order --------------------------------------------------------------------

interface OrderInteractionProps {
  items: InteractiveItem[];
  /** Serialized order (list of item ids). Empty = authored order. */
  value: string;
  onChange: (serialized: string) => void;
  startLabel?: string;
  endLabel?: string;
  disabled?: boolean;
  feedback?: InteractionFeedback;
}

export function OrderInteraction({
  items,
  value,
  onChange,
  startLabel,
  endLabel,
  disabled = false,
  feedback = null,
}: OrderInteractionProps) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const parsed = parseOrderAnswer(value);
  // Fall back to authored order until the learner rearranges. Guard against a
  // stale/partial order by rebuilding from known item ids.
  const order =
    parsed.length === items.length && parsed.every((id) => itemsById.has(id)) ? parsed : items.map((item) => item.id);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const reduce = useReducedMotion();
  const controls = useFeedbackMotion(feedback, reduce);
  const correct = feedback === 'correct';

  const move = (from: number, to: number) => {
    if (disabled || to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(serializeOrderAnswer(next));
  };

  const clearDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const onDrop = (targetIndex: number) => (event: React.DragEvent) => {
    event.preventDefault();
    const fromRaw = event.dataTransfer.getData('text/plain');
    const from = Number(fromRaw);
    if (Number.isInteger(from)) move(from, targetIndex);
    clearDrag();
  };

  return (
    <MotionBox animate={controls}>
      {startLabel && (
        <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 700, color: 'primary.main' }}>
          ↑ {startLabel}
        </Typography>
      )}
      <Stack spacing={1}>
        {order.map((itemId, index) => {
          const item = itemsById.get(itemId);
          if (!item) return null;
          const isDragging = dragIndex === index;
          const isInsertTarget = dragIndex !== null && overIndex === index && dragIndex !== index;
          const dimmed = dragIndex !== null && !isDragging && !isInsertTarget;
          return (
            <MotionBox
              key={itemId}
              layout={!reduce}
              transition={{ duration: 0.26, ease: EASE }}
              animate={reduce ? undefined : { scale: isDragging ? 1.03 : 1, opacity: dimmed ? 0.65 : 1 }}
              draggable={!disabled}
              onDragStartCapture={(event: React.DragEvent) => {
                event.dataTransfer.setData('text/plain', String(index));
                event.dataTransfer.effectAllowed = 'move';
                setDragIndex(index);
              }}
              onDragOver={(event: React.DragEvent) => {
                event.preventDefault();
                setOverIndex(index);
              }}
              onDrop={onDrop(index)}
              onDragEndCapture={clearDrag}
              sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                pl: 1,
                borderRadius: 2,
                border: '1px solid',
                borderColor: correct ? 'success.main' : isInsertTarget ? 'primary.main' : 'divider',
                bgcolor: correct ? 'rgba(46,125,50,0.06)' : 'background.paper',
                cursor: disabled ? 'default' : 'grab',
                boxShadow: isDragging
                  ? '0 12px 28px rgba(31,36,48,0.20)'
                  : correct
                    ? GREEN_GLOW
                    : '0 1px 3px rgba(31,36,48,0.10)',
                transition: 'box-shadow 200ms ease, border-color 160ms ease, background-color 200ms ease',
                '&:active': { cursor: disabled ? 'default' : 'grabbing' },
              }}
            >
              {/* Insertion indicator */}
              {isInsertTarget && (
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    top: -5,
                    left: 8,
                    right: 8,
                    height: 3,
                    borderRadius: 999,
                    bgcolor: 'primary.main',
                  }}
                />
              )}
              {!disabled && <GripDots />}
              <Box
                component="span"
                className="numeric"
                aria-hidden
                sx={{ fontWeight: 900, color: 'primary.main', minWidth: 20, textAlign: 'center' }}
              >
                {index + 1}
              </Box>
              <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, lineHeight: 1.3 }}>
                {item.label}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  aria-label={`Move "${item.label}" up`}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, index - 1)}
                  sx={{ minWidth: 36, px: 0, fontWeight: 900 }}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  aria-label={`Move "${item.label}" down`}
                  disabled={disabled || index === order.length - 1}
                  onClick={() => move(index, index + 1)}
                  sx={{ minWidth: 36, px: 0, fontWeight: 900 }}
                >
                  ↓
                </Button>
              </Stack>
            </MotionBox>
          );
        })}
      </Stack>
      {endLabel && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontWeight: 700, color: 'primary.main' }}>
          ↓ {endLabel}
        </Typography>
      )}
    </MotionBox>
  );
}
