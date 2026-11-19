/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { BeachDetailPage } from './pages/BeachDetailPage';
import { FeedPage } from './pages/FeedPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ModerationPage } from './pages/ModerationPage';
import { NewReportPage } from './pages/NewReportPage';
import { ProfilePage } from './pages/ProfilePage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/praia/:slug" element={<BeachDetailPage />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/relatar" element={<NewReportPage />} />
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/moderacao" element={<ModerationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
