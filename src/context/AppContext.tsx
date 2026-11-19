import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import * as authService from '../services/auth';
import * as beachesService from '../services/beaches';
import * as reportsService from '../services/reports';
import * as snapshotsService from '../services/snapshots';
import type {
  AppUser,
  Beach,
  BeachReport,
  BeachSnapshot,
  CreateReportPayload,
} from '../types';

const STORAGE_SAFETY_DISMISSED = 'praiou_safety_dismissed';

interface AppContextValue {
  beaches: Beach[];
  snapshots: BeachSnapshot[];
  reports: BeachReport[];
  flaggedReportIds: string[];
  user: AppUser | null;
  isInitialLoading: boolean;
  loadError: string | null;
  safetyBannerDismissed: boolean;
  dismissSafetyBanner: () => void;
  getSnapshotByBeachId: (beachId: string) => BeachSnapshot | undefined;
  refreshData: (forceRefresh?: boolean) => Promise<void>;
  addReport: (payload: CreateReportPayload) => Promise<BeachReport>;
  deleteReport: (reportId: string) => Promise<void>;
  flagReport: (reportId: string) => Promise<void>;
  loginDemo: (provider: 'google' | 'email', email?: string) => Promise<void>;
  updateUserName: (name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [snapshots, setSnapshots] = useState<BeachSnapshot[]>([]);
  const [reports, setReports] = useState<BeachReport[]>([]);
  const [flaggedReportIds, setFlaggedReportIds] = useState<string[]>([]);
  const [user, setUser] = useState<AppUser | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [safetyBannerDismissed, setSafetyBannerDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_SAFETY_DISMISSED) === '1';
    } catch {
      return false;
    }
  });

  const loadAll = useCallback(async (forceRefresh = false) => {
    setLoadError(null);
    try {
      const [loadedBeaches, loadedSnapshots, loadedReports, currentUser] =
        await Promise.all([
          beachesService.getBeaches(),
          snapshotsService.getLatestSnapshots(forceRefresh),
          reportsService.getAllReports(),
          authService.getCurrentUser(),
        ]);

      const beachBySlug = new Map(loadedBeaches.map((b) => [b.slug, b]));
      const alignedReports = loadedReports.map((report) => {
        const matchedBeach = beachBySlug.get(report.beachSlug);
        return matchedBeach ? { ...report, beachId: matchedBeach.id } : report;
      });

      setBeaches(loadedBeaches);
      setSnapshots(loadedSnapshots);
      setReports(alignedReports);
      setUser(currentUser);
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

  const addReport = async (payload: CreateReportPayload): Promise<BeachReport> => {
    const created = await reportsService.createReport(payload);
    setReports((prev) => [created, ...prev]);
    return created;
  };

  const deleteReport = async (reportId: string): Promise<void> => {
    await reportsService.deleteReport(reportId);
    setReports((prev) => prev.filter((r) => r.id !== reportId));
  };

  const flagReport = async (reportId: string): Promise<void> => {
    if (flaggedReportIds.includes(reportId)) return;
    await reportsService.flagReport(reportId);
    setFlaggedReportIds((prev) => [...prev, reportId]);
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, flagsCount: r.flagsCount + 1 } : r))
    );
  };

  const loginDemo = async (
    provider: 'google' | 'email',
    email?: string
  ): Promise<void> => {
    const loggedUser =
      provider === 'google'
        ? await authService.signInWithGoogle()
        : await authService.signInWithEmail(email ?? '');
    setUser(loggedUser);
  };

  const updateUserName = async (name: string): Promise<void> => {
    const updated = await authService.updateCurrentUserName(name);
    if (!updated) return;
    setUser(updated);
    reportsService.syncAuthorNameInReports(updated.id, updated.name);
    setReports((prev) =>
      prev.map((r) =>
        r.userId === updated.id ? { ...r, userName: updated.name } : r
      )
    );
  };

  const logout = async (): Promise<void> => {
    await authService.signOut();
    setUser(null);
  };

  return (
    <AppContext.Provider
      value={{
        beaches,
        snapshots,
        reports,
        flaggedReportIds,
        user,
        isInitialLoading,
        loadError,
        safetyBannerDismissed,
        dismissSafetyBanner,
        getSnapshotByBeachId,
        refreshData,
        addReport,
        deleteReport,
        flagReport,
        loginDemo,
        updateUserName,
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
