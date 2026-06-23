import { GoogleAuthProvider, User, signInWithEmailAndPassword, signInWithPopup, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

async function ensureUserProfile(user: User) {
  if (!db) return;

  const userDocRef = doc(db, 'users', user.uid);
  const userSnapshot = await getDoc(userDocRef);
  const today = new Date().toISOString().slice(0, 10);

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
      lastActiveDate: today,
    },
    { merge: true }
  );
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
