import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { PublicLayout } from './components/layout/PublicLayout';
import { FullPageSpinner } from './components/ui/Spinner';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { ExplorePage } from './pages/ExplorePage';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfessionalPage } from './pages/ProfessionalPage';

// Code splitting: pages only some users need are downloaded on first visit instead of
// being bundled into the initial JavaScript every visitor pays for.
const named = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => loader().then((module) => ({ default: module[name] })));

const DashboardLayout = named(
  () => import('./components/layout/DashboardLayout'),
  'DashboardLayout',
);
const AgendaPage = named(() => import('./pages/dashboard/AgendaPage'), 'AgendaPage');
const ServicesPage = named(() => import('./pages/dashboard/ServicesPage'), 'ServicesPage');
const SchedulePage = named(() => import('./pages/dashboard/SchedulePage'), 'SchedulePage');
const SettingsPage = named(() => import('./pages/dashboard/SettingsPage'), 'SettingsPage');
const MyAppointmentsPage = named(() => import('./pages/MyAppointmentsPage'), 'MyAppointmentsPage');

export function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />

        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="/explorar" element={<ExplorePage />} />
          <Route path="/p/:slug" element={<ProfessionalPage />} />
          <Route
            path="/mis-turnos"
            element={
              <RequireAuth role="CLIENT">
                <MyAppointmentsPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route
          path="/dashboard"
          element={
            <RequireAuth role="PROFESSIONAL">
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route index element={<AgendaPage />} />
          <Route path="servicios" element={<ServicesPage />} />
          <Route path="horarios" element={<SchedulePage />} />
          <Route path="configuracion" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
