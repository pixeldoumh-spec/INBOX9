import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { AccountPage } from '../features/account/AccountPage';
import { ActivationPage } from '../features/activations/ActivationPage';
import { ActivePage } from '../features/activations/ActivePage';
import { AppsPage } from '../features/apps/AppsPage';
import { LoginPage } from '../features/auth/LoginPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { ServicePage } from '../features/services/ServicePage';
import { SupportPage } from '../features/support/SupportPage';
import { WalletPage } from '../features/wallet/WalletPage';

export const appRouter = createBrowserRouter([
  { path: '/login', Component: LoginPage },
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, element: <Navigate to="/apps" replace /> },
      { path: 'apps', Component: AppsPage },
      { path: 'apps/service/:serviceId', Component: ServicePage },
      { path: 'active', Component: ActivePage },
      { path: 'active/:activationId', Component: ActivationPage },
      { path: 'wallet', Component: WalletPage },
      { path: 'buy', element: <Navigate to="/wallet" replace /> },
      { path: 'notifications', Component: NotificationsPage },
      { path: 'support', Component: SupportPage },
      { path: 'account', Component: AccountPage },
    ],
  },
]);
