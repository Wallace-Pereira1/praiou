import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as authService from '../services/auth';
import * as beachesService from '../services/beaches';
import * as profilesService from '../services/profiles';
import * as snapshotsService from '../services/snapshots';
import type {
  AppUser,
  Beach,
  BeachSnapshot,
  UserProfile,
} from '../types';

const STORAGE_SAFETY_DISMISSED = 'praiou_safety_dismissed';

interface AppContextValue {
  beaches: Beach[];
  snapshots: BeachSnapshot[];
  user: AppUser | null;
  profile: UserProfile | null;
  profileLoading: boolean;
  profileError: string | null;
  authReady: boolean;
  isInitialLoading: boolean;
  loadError: string | null;
  safetyBannerDismissed: boolean;
  dismissSafetyBanner: () => void;
  getSnapshotByBeachId: (beachId: string) => BeachSnapshot | undefined;
  refreshData: (forceRefresh?: boolean) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfileName: (displayName: string) => Promise<UserProfile>;
  uploadProfileAvatar: (blob: Blob) => Promise<UserProfile>;
  removeProfileAvatar: () => Promise<UserProfile>;
  signInWithGoogle: () => Promise<void>;
  exchangeOAuthCode: (code: string) => Promise<AppUser>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [snapshots, setSnapshots] = useState<BeachSnapshot[]>([]);
  const [authUser, setAuthUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Evita que uma leitura inicial lenta sobrescreva eventos mais recentes de autenticação
  const authEpochRef = useRef(0);
  const profileRequestRef = useRef(0);

  const [safetyBannerDismissed, setSafetyBannerDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_SAFETY_DISMISSED) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mounted = true;

    const unsubscribe = authService.onAuthStateChange((nextUser) => {
      if (!mounted) return;
      authEpochRef.current += 1;
      setAuthUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setProfileError(null);
        setProfileLoading(false);
      }
      setAuthReady(true);
    });

    const capturedEpoch = authEpochRef.current;
    void authService
      .getCurrentUser()
      .then((initialUser) => {
        if (!mounted) return;
        if (authEpochRef.current === capturedEpoch) {
          setAuthUser(initialUser);
          setAuthReady(true);
        }
      })
      .catch(() => {
        if (!mounted) return;
        if (authEpochRef.current === capturedEpoch) {
          setAuthUser(null);
          setAuthReady(true);
        }
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const fetchProfileForUser = useCallback(async (userId: string) => {
    const requestId = ++profileRequestRef.current;
    setProfileLoading(true);
    setProfileError(null);

    try {
      const loadedProfile = await profilesService.getProfile(userId);
      if (profileRequestRef.current !== requestId) return;
      setProfile(loadedProfile);
    } catch (err) {
      if (profileRequestRef.current !== requestId) return;
      setProfileError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar seu perfil público.'
      );
    } finally {
      if (profileRequestRef.current === requestId) {
        setProfileLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;

    if (!authUser?.id) {
      profileRequestRef.current += 1;
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }

    void fetchProfileForUser(authUser.id);
  }, [authReady, authUser?.id, fetchProfileForUser]);

  const refreshProfile = useCallback(async () => {
    if (!authUser?.id) return;
    await fetchProfileForUser(authUser.id);
  }, [authUser?.id, fetchProfileForUser]);

  const updateProfileName = useCallback(
    async (displayName: string): Promise<UserProfile> => {
      const updated = await profilesService.updateOwnProfile({ displayName });
      setProfile(updated);
      setProfileError(null);
      return updated;
    },
    []
  );

  const uploadProfileAvatar = useCallback(async (blob: Blob): Promise<UserProfile> => {
    const updated = await profilesService.uploadOwnAvatar(blob);
    setProfile(updated);
    setProfileError(null);
    return updated;
  }, []);

  const removeProfileAvatar = useCallback(async (): Promise<UserProfile> => {
    const updated = await profilesService.removeOwnAvatar();
    setProfile(updated);
    setProfileError(null);
    return updated;
  }, []);

  const loadAll = useCallback(async (forceRefresh = false) => {
    setLoadError(null);
    try {
      const [loadedBeaches, loadedSnapshots] = await Promise.all([
        beachesService.getBeaches(),
        snapshotsService.getLatestSnapshots(forceRefresh),
      ]);

      setBeaches(loadedBeaches);
      setSnapshots(loadedSnapshots);
    } catch {
      setLoadError('Não foi possível carregar os dados das praias agora.');
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll(false);
  }, [loadAll]);

  const refreshData = useCallback(
    async (forceRefresh = true) => {
      await loadAll(forceRefresh);
    },
    [loadAll]
  );

  const dismissSafetyBanner = () => {
    setSafetyBannerDismissed(true);
    try {
      localStorage.setItem(STORAGE_SAFETY_DISMISSED, '1');
    } catch {
      // Ignora
    }
  };

  const getSnapshotByBeachId = (beachId: string) =>
    snapshots.find((s) => s.beachId === beachId);

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    await authService.signInWithGoogle();
  }, []);

  const exchangeOAuthCode = useCallback(async (code: string): Promise<AppUser> => {
    const authenticatedUser = await authService.exchangeCodeForSession(code);
    authEpochRef.current += 1;
    setAuthUser(authenticatedUser);
    setAuthReady(true);
    return authenticatedUser;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await authService.signOut();
    authEpochRef.current += 1;
    profileRequestRef.current += 1;
    setAuthUser(null);
    setProfile(null);
    setProfileError(null);
    setProfileLoading(false);
    setAuthReady(true);
  }, []);

  const user = useMemo<AppUser | null>(() => {
    if (!authUser) return null;
    return {
      ...authUser,
      name: profile?.displayName ?? authUser.name,
      avatarUrl: profile?.avatarUrl ?? authUser.avatarUrl,
      hasCustomAvatar: Boolean(profile?.avatarPath),
    };
  }, [authUser, profile]);

  return (
    <AppContext.Provider
      value={{
        beaches,
        snapshots,
        user,
        profile,
        profileLoading,
        profileError,
        authReady,
        isInitialLoading,
        loadError,
        safetyBannerDismissed,
        dismissSafetyBanner,
        getSnapshotByBeachId,
        refreshData,
        refreshProfile,
        updateProfileName,
        uploadProfileAvatar,
        removeProfileAvatar,
        signInWithGoogle,
        exchangeOAuthCode,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp deve ser usado dentro de AppProvider');
  }
  return ctx;
}
