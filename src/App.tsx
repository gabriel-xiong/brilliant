import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { playClick } from './services/soundService';
import LandingPage from './routes/LandingPage';
import SignInPage from './routes/SignInPage';
import CoursePathPage from './routes/CoursePathPage';
import LessonPlayerPage from './routes/LessonPlayerPage';
import ProfilePage from './routes/ProfilePage';
import PracticePage from './routes/PracticePage';
import ExamPage from './routes/ExamPage';
import { AuthProvider } from './contexts/AuthContext';

const theme = createTheme({
  palette: {
    primary: {
      main: '#0f6f68',
      dark: '#084f4a',
      contrastText: '#fffaf0',
    },
    secondary: {
      main: '#c35f2c',
      contrastText: '#fffaf0',
    },
    background: {
      default: '#fff8e8',
      paper: '#fffdf7',
    },
    text: {
      primary: '#1f2430',
      secondary: '#5d6575',
    },
  },
  typography: {
    fontFamily: "'Source Sans 3', system-ui, sans-serif",
    h1: { fontFamily: "'Bricolage Grotesque', 'Source Sans 3', system-ui, sans-serif", fontWeight: 800 },
    h2: { fontFamily: "'Bricolage Grotesque', 'Source Sans 3', system-ui, sans-serif", fontWeight: 800 },
    h3: { fontFamily: "'Bricolage Grotesque', 'Source Sans 3', system-ui, sans-serif", fontWeight: 800 },
    h4: { fontFamily: "'Bricolage Grotesque', 'Source Sans 3', system-ui, sans-serif", fontWeight: 800 },
    h5: { fontFamily: "'Bricolage Grotesque', 'Source Sans 3', system-ui, sans-serif", fontWeight: 700 },
    h6: { fontFamily: "'Bricolage Grotesque', 'Source Sans 3', system-ui, sans-serif", fontWeight: 700 },
    button: { fontWeight: 700, letterSpacing: 0.02 },
  },
  shape: {
    borderRadius: 18,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 18px 55px rgba(68, 50, 23, 0.10)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          textTransform: 'none',
          paddingInline: 20,
        },
      },
    },
  },
});

function App() {
  // One delegated listener plays a soft click for any button press app-wide,
  // so individual components never need to opt in. `click` (not pointerdown)
  // fires once per activation, including keyboard Enter/Space on buttons, and
  // avoids double-firing. The AudioContext is created lazily inside playClick,
  // and this click is itself the required user gesture to unlock audio.
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      const interactive = target.closest('button, [role="button"], .MuiButtonBase-root');
      if (!interactive) return;
      if (interactive.getAttribute('aria-disabled') === 'true' || (interactive as HTMLButtonElement).disabled) {
        return;
      }
      playClick();
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/course" element={<CoursePathPage />} />
          <Route path="/lesson/:lessonId" element={<LessonPlayerPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/exam" element={<ExamPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
