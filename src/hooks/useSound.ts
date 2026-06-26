import { useCallback, useEffect, useState } from 'react';
import {
  isSoundEnabled,
  playClick,
  playLessonComplete,
  setSoundEnabled,
  subscribeSound,
  toggleSound,
} from '../services/soundService';

/**
 * React access to the synthesized sound effects and the persisted on/off
 * preference. The `enabled` value stays in sync with any other consumer (e.g.
 * a second toggle on another route) via the soundService subscription.
 */
export function useSound() {
  const [enabled, setEnabledState] = useState<boolean>(() => isSoundEnabled());

  useEffect(() => subscribeSound(setEnabledState), []);

  const toggle = useCallback(() => toggleSound(), []);
  const setEnabled = useCallback((value: boolean) => setSoundEnabled(value), []);

  return { enabled, toggle, setEnabled, playClick, playLessonComplete };
}
