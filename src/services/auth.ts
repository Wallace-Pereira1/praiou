import { DEMO_USER_ID } from '../data/mockReports';
import type { AppUser } from '../types';

const STORAGE_USER_KEY = 'praiou_demo_user';

function delay(ms = 120): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readStoredUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

function writeStoredUser(user: AppUser | null): void {
  try {
    if (user) {
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_USER_KEY);
    }
  } catch {
    // Ignora falhas de storage privado
  }
}

export async function getCurrentUser(): Promise<AppUser | null> {
  await delay(80);
  return readStoredUser();
}

export async function signInWithGoogle(): Promise<AppUser> {
  await delay(450);
  const user: AppUser = {
    id: DEMO_USER_ID,
    name: 'Marina Costa',
    email: 'marina.costa@gmail.com',
    provider: 'google',
  };
  writeStoredUser(user);
  return user;
}

export async function signInWithEmail(email: string): Promise<AppUser> {
  await delay(450);
  const cleanEmail = email.trim();
  const derivedName =
    cleanEmail
      .split('@')[0]
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Banhista RJ';

  const user: AppUser = {
    id: DEMO_USER_ID,
    name: derivedName,
    email: cleanEmail,
    provider: 'email',
  };
  writeStoredUser(user);
  return user;
}

export async function updateCurrentUserName(name: string): Promise<AppUser | null> {
  await delay(150);
  const current = readStoredUser();
  const trimmed = name.trim();
  if (!current || !trimmed) return current;

  const updated: AppUser = { ...current, name: trimmed };
  writeStoredUser(updated);
  return updated;
}

export async function signOut(): Promise<void> {
  await delay(150);
  writeStoredUser(null);
}
