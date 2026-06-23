import { Button, Container, Stack, Typography, Alert } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

export default function SignInPage() {
  const { signInWithGoogle, signInWithEmail, firebaseEnabled } = useAuth();

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
      <Stack spacing={2}>
        <Button variant="contained" size="large" onClick={signInWithGoogle} disabled={!firebaseEnabled}>
          Sign in with Google
        </Button>
        <Button
          variant="outlined"
          size="large"
          onClick={() => signInWithEmail('student@example.com', 'password')}
          disabled={!firebaseEnabled}
        >
          Sign in with email
        </Button>
      </Stack>
    </Container>
  );
}
