import { IconButton, Tooltip } from '@mui/material';
import { useSound } from '../hooks/useSound';

/**
 * Compact speaker on/off control for the synthesized UI sounds. Inline SVG keeps
 * it crisp without pulling in an icon dependency (matching StreakDisplay). The
 * toggle reflects and persists the global `soundEnabled` preference.
 */
function SpeakerIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 9.5h3l4-3.2v11.4l-4-3.2H4z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {enabled ? (
        <>
          <path d="M15.2 9.2a3.6 3.6 0 0 1 0 5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M17.4 7a6.6 6.6 0 0 1 0 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <path d="M16 9.5l4 5M20 9.5l-4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

interface SoundToggleProps {
  /** Optional size override; matches MUI IconButton sizes. */
  size?: 'small' | 'medium';
}

export default function SoundToggle({ size = 'small' }: SoundToggleProps) {
  const { enabled, toggle } = useSound();
  const label = enabled ? 'Mute sound effects' : 'Enable sound effects';

  return (
    <Tooltip title={label} arrow>
      <IconButton
        size={size}
        onClick={toggle}
        aria-label={label}
        aria-pressed={enabled}
        sx={{ color: enabled ? 'primary.main' : 'text.secondary' }}
      >
        <SpeakerIcon enabled={enabled} />
      </IconButton>
    </Tooltip>
  );
}
