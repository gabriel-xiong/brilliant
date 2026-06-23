import { FirebaseError } from 'firebase/app';

export function isFirebaseError(error: unknown): error is FirebaseError {
  return typeof error === 'object' && error !== null && 'code' in error && typeof (error as any).code === 'string';
}

export function isFirestorePermissionError(error: unknown): boolean {
  return isFirebaseError(error) && error.code === 'permission-denied';
}

export function getFirestoreFallbackReason(error: unknown, defaultReason: string): string {
  if (isFirestorePermissionError(error)) {
    return 'Firestore permission denied. Update Cloud Firestore security rules to allow read/write access for authenticated users, and verify your Firebase project is active.';
  }

  return defaultReason;
}
