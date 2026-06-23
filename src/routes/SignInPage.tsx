import { FormEvent, useState } from 'react';
import { Alert, Button, Container, Stack, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getFriendlyAuthError } from '../services/authService';

export default function SignInPage() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, firebaseEnabled } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      navigate('/course');
    } catch (authError) {
      setError(getFriendlyAuthError(authError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    try {
      await signInWithGoogle();
      navigate('/course');
    } catch (authError) {
      setError(getFriendlyAuthError(authError));
    }
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Brilliant Probability
      </Typography>
      <Typography variant="body1" sx={{ mb: 4 }}>
        Sign in to save your progress and continue learning probability with interactive lessons.
      </Typography>
      {!firebaseEnabled && (
        <Alert severity="warning" sx={{ mb: 4 }}>
          Firebase is not configured yet. Add your keys to <code>.env</code> to enable sign-in.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
          {error}
        </Alert>
      )}
      <Stack component="form" spacing={2} onSubmit={handleEmailAuth} sx={{ mb: 2 }}>
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={!firebaseEnabled || submitting}
          required
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={!firebaseEnabled || submitting}
          required
          fullWidth
          inputProps={{ minLength: 6 }}
        />
        <Button type="submit" variant="contained" size="large" disabled={!firebaseEnabled || submitting}>
          {mode === 'signin' ? 'Sign in with email' : 'Create account'}
        </Button>
      </Stack>
      <Stack spacing={2}>
        <Button variant="outlined" size="large" onClick={handleGoogleSignIn} disabled={!firebaseEnabled || submitting}>
          Sign in with Google
        </Button>
        <Button
          variant="text"
          size="small"
          onClick={() => {
            setMode((currentMode) => (currentMode === 'signin' ? 'signup' : 'signin'));
            setError(null);
          }}
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </Button>
      </Stack>
    </Container>
  );
}
