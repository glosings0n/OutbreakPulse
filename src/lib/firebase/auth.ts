import { getAuth, onAuthStateChanged, signInAnonymously, signOut, type Auth, type User } from "firebase/auth";
import { getFirebaseApp } from "./app";

let auth: Auth | null = null;

export function getAuthInstance(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

/** One-click guest access for judges. The anonymous session persists in IndexedDB, so it survives offline reloads. */
export async function signInAsGuest(): Promise<User> {
  const cred = await signInAnonymously(getAuthInstance());
  return cred.user;
}

export function watchUser(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getAuthInstance(), callback);
}

export function signOutUser(): Promise<void> {
  return signOut(getAuthInstance());
}
