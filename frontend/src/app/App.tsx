import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './providers';
import { appRouter } from './router';
import { SessionBootstrap } from '../features/auth/SessionBootstrap';

export function App() {
  return (
    <AppProviders>
      <SessionBootstrap />
      <RouterProvider router={appRouter} />
    </AppProviders>
  );
}
