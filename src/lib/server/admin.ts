import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const DEFAULT_PROJECT = 'english-buddy-431f9';

export function getStorageBucketName(): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || DEFAULT_PROJECT}.firebasestorage.app`
  );
}

// Single place that initializes firebase-admin for every server route.
export function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0] as App;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccount) {
    const decoded = serviceAccount.startsWith('{')
      ? serviceAccount
      : Buffer.from(serviceAccount, 'base64').toString('utf-8');
    return initializeApp({ credential: cert(JSON.parse(decoded)), storageBucket: getStorageBucketName() });
  }
  if (process.env.NEXT_PUBLIC_USE_EMULATORS === 'true') {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8180';
    return initializeApp({ projectId: 'demo-english-buddy', storageBucket: 'demo-english-buddy.firebasestorage.app' });
  }
  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || DEFAULT_PROJECT,
    storageBucket: getStorageBucketName(),
  });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminBucket() {
  return getStorage(getAdminApp()).bucket(getStorageBucketName());
}
