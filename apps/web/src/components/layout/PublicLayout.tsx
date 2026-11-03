import { CalendarCheck, LayoutDashboard, LogOut, Search } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { ButtonLink } from '../ui/Button';
import { cn } from '../ui/cn';
import { Logo } from './Logo';

// Set VITE_REPO_URL at build time to show a link to the source code.
const REPO_URL = import.meta.env.VITE_REPO_URL as string | undefined;

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand-50 text-brand-800'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  );

export function PublicLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav className="flex items-center gap-1" aria-label="Principal">
            <NavLink to="/explorar" className={navLink}>
              <Search className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Explorar</span>
            </NavLink>
            {user?.role === 'CLIENT' && (
              <NavLink to="/mis-turnos" className={navLink}>
                <CalendarCheck className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Mis turnos</span>
              </NavLink>
            )}
            {user?.role === 'PROFESSIONAL' && (
              <NavLink to="/dashboard" className={navLink}>
                <LayoutDashboard className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Mi panel</span>
              </NavLink>
            )}
            {user ? (
              <button type="button" onClick={handleLogout} className={navLink({ isActive: false })}>
                <LogOut className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            ) : (
              <>
                <NavLink to="/login" className={navLink}>
                  Ingresar
                </NavLink>
                <ButtonLink to="/registro" size="sm" className="ml-1">
                  Crear cuenta
                </ButtonLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:justify-between">
          <p>Agendo · Proyecto de portfolio</p>
          {REPO_URL && (
            <a className="hover:text-slate-700" href={REPO_URL} target="_blank" rel="noreferrer">
              Código fuente en GitHub
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}
