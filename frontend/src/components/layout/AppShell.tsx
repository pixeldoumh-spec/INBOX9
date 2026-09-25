import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getNotifications } from '../../api/notifications';
import { useSessionStore } from '../../state/session';

function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8M10 21h4" /></svg>;
}
function WalletIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v14.5A1.5 1.5 0 0 1 18.5 20h-12A2.5 2.5 0 0 1 4 17.5v-11Z" /><path d="M4 7h12.5A3.5 3.5 0 0 1 20 10.5V13h-5.5a2.5 2.5 0 0 1 0-5H20M17 10.5h.01" /></svg>;
}
function AppsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
}
function BuyIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h15l-1.3 9.5H7.2L5 4H3" /><path d="M9 19.5h.01M17 19.5h.01" /></svg>;
}
function ActiveIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
}
function AccountIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.4 3.1-5 7-5s6.2 1.6 7 5" /></svg>;
}

const navigation = [
  { to: '/apps', label: 'Apps', Icon: AppsIcon },
  { to: '/wallet', label: 'Buy', Icon: BuyIcon },
  { to: '/active', label: 'Active', Icon: ActiveIcon },
  { to: '/account', label: 'Account', Icon: AccountIcon },
];

export function AppShell() {
  const location = useLocation();
  const user = useSessionStore((state) => state.user);
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    enabled: Boolean(user),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const unread = notifications.data?.notifications.filter((item) => !item.read).length ?? 0;
  const isAppSection = location.pathname.startsWith('/apps') || location.pathname === '/';

  return (
    <div className="app-shell">
      <header className="top-header">
        <NavLink className="brand" to="/apps" aria-label="INBOX9 home">
          <span className="brand-mark" aria-hidden="true">9</span>
          <span>INBOX9</span>
        </NavLink>

        <div className="header-actions">
          <NavLink className="header-icon-button" to="/notifications" aria-label={unread ? `${unread} unread notifications` : 'Notifications'}>
            <BellIcon />
            {unread > 0 ? <span className="notification-badge">{unread > 99 ? '99+' : unread}</span> : null}
          </NavLink>
          <NavLink className="fund-button" to="/wallet">
            <WalletIcon />
            <span>Add Funds</span>
          </NavLink>
          <NavLink className="account-mini" to="/account" aria-label="Account">
            <AccountIcon />
          </NavLink>
        </div>
      </header>

      <main className={`app-content ${isAppSection ? 'app-content-launcher' : ''}`}>
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navigation.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="bottom-nav-item">
            <span className="bottom-nav-icon"><Icon /></span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
