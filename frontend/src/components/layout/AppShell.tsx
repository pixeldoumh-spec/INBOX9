import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { to: '/apps', label: 'Apps' },
  { to: '/active', label: 'Active' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/support', label: 'Support' },
  { to: '/account', label: 'Account' },
];

export function AppShell() {
  return (
    <div className="app-shell-placeholder">
      <header className="placeholder-header">INBOX9 frontend foundation</header>
      <main>
        <Outlet />
      </main>
      <nav className="placeholder-nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <NavLink key={item.to} to={item.to}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
