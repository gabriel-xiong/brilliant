import { GoogleAuthProvider, User, signInWithEmailAndPassword, signInWithPopup, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { auth, db } from '../firebase';
import { localDateString, updateUserStreak } from './progressService';

export function getFriendlyAuthError(error: unknown) {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : 'Unable to sign in. Check your credentials and try again.';
  }

  switch (error.code) {
    case 'auth/configuration-not-found':
      return 'Firebase Authentication is not enabled for this project yet. In Firebase Console, open Build > Authentication, click Get started, then enable Email/Password and Google sign-in providers.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is disabled in Firebase. Enable the matching provider under Firebase Console > Authentication > Sign-in method.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Firebase Auth. Add localhost and your deployed domain under Firebase Console > Authentication > Settings > Authorized domains.';
    case 'auth/email-already-in-use':
      return 'That email already has an account. Switch to sign in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/weak-password':
      return 'Use a password with at least 6 characters.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before it finished.';
    default:
      return `Firebase Auth error: ${error.code}.`;
  }
}

async function ensureUserProfile(user: User) {
  if (!db) return;

  const userDocRef = doc(db, 'users', user.uid);
  const userSnapshot = await getDoc(userDocRef);
  const today = localDateString();

  if (!userSnapshot.exists()) {
    await setDoc(userDocRef, {
      displayName: user.displayName || null,
      email: user.email || null,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      lastActiveDate: today,
      currentStreak: 1,
      longestStreak: 1,
      masterySummary: {},
    });
    return;
  }

  await setDoc(
    userDocRef,
    {
      displayName: user.displayName || null,
      email: user.email || null,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true }
  );

  await updateUserStreak(user.uid, today);
}

export async function firebaseSignInWithGoogle() {
  if (!auth) {
    throw new Error('Firebase auth is not configured. Add your Firebase settings to .env.');
  }

  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);

  if (credential.user) {
    await ensureUserProfile(credential.user);
  }
}

export async function firebaseSignInWithEmail(email: string, password: string) {
  if (!auth) {
    throw new Error('Firebase auth is not configured. Add your Firebase settings to .env.');
  }

  const credential = await signInWithEmailAndPassword(auth, email, password);

  if (credential.user) {
    await ensureUserProfile(credential.user);
  }
}

export async function firebaseSignUpWithEmail(email: string, password: string) {
  if (!auth) {
    throw new Error('Firebase auth is not configured. Add your Firebase settings to .env.');
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);

  if (credential.user) {
    await ensureUserProfile(credential.user);
  }
}

export async function firebaseSignOut() {
  if (!auth) return;
  await signOut(auth);
}
