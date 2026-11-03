import { CalendarDays, Clock, ExternalLink, LogOut, Scissors, Settings } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { cn } from '../ui/cn';
import { Logo } from './Logo';

const items = [
  { to: '/dashboard', label: 'Agenda', icon: CalendarDays, end: true },
  { to: '/dashboard/servicios', label: 'Servicios', icon: Scissors, end: false },
  { to: '/dashboard/horarios', label: 'Horarios', icon: Clock, end: false },
  { to: '/dashboard/configuracion', label: 'Configuración', icon: Settings, end: false },
];

const itemClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
    isActive
      ? 'bg-brand-50 text-brand-800'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  );

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const slug = user?.professional?.slug;

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex h-16 items-center justify-between px-4 lg:px-5">
          <Logo />
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Salir"
          >
            <LogOut className="size-5" />
          </button>
        </div>

        <div className="hidden px-5 pb-4 lg:block">
          <p className="truncate text-sm font-semibold text-slate-900">
            {user?.professional?.businessName}
          </p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
        </div>

        <nav
          aria-label="Panel"
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible"
        >
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={itemClasses}>
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          {slug && (
            <a
              href={`/p/${slug}`}
              target="_blank"
              rel="noreferrer"
              className={itemClasses({ isActive: false })}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Mi página pública
            </a>
          )}
        </nav>

        <div className="hidden border-t border-slate-200 p-3 lg:block">
          <button
            type="button"
            onClick={handleLogout}
            className={cn(itemClasses({ isActive: false }), 'w-full')}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
