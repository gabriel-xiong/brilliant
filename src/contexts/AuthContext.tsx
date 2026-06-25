import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth, firebaseEnabled } from '../firebase';
import { firebaseSignInWithGoogle, firebaseSignInWithEmail, firebaseSignUpWithEmail } from '../services/authService';
import { clearGuestProgress } from '../services/progressService';

export type AuthUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  firebaseEnabled: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function mapFirebaseUser(user: User): AuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseEnabled || !auth) {
      // Without Firebase everyone is a guest: ensure no stale guest cache from a
      // previous build survives this reload.
      clearGuestProgress();
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      // `onAuthStateChanged` fires once auth has resolved, with the restored
      // user already populated from persistence. A `null` here therefore means
      // "resolved to signed-out" — not the transient pre-resolution null — so
      // it is safe to wipe guest progress without clobbering a returning
      // signed-in user (whose data lives in Firestore + a user-scoped cache).
      if (firebaseUser) {
        setUser(mapFirebaseUser(firebaseUser));
      } else {
        clearGuestProgress();
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      firebaseEnabled,
      signInWithGoogle: async () => firebaseSignInWithGoogle(),
      signInWithEmail: async (email: string, password: string) => firebaseSignInWithEmail(email, password),
      signUpWithEmail: async (email: string, password: string) => firebaseSignUpWithEmail(email, password),
      signOutUser: async () => {
        if (!auth) return;
        return signOut(auth);
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
