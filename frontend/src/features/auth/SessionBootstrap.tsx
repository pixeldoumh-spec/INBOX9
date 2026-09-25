import { useEffect } from 'react';
import { getMe } from '../../api/auth';
import { useSessionStore } from '../../state/session';

export function SessionBootstrap() {
  const setUser = useSessionStore((state) => state.setUser);
  const setBootstrap = useSessionStore((state) => state.setBootstrap);

  useEffect(() => {
    let active = true;
    setBootstrap('loading');

    void getMe()
      .then((result) => {
        if (!active) return;
        setUser(result.authenticated ? result.user ?? null : null);
        setBootstrap(result.authenticated ? 'ready' : 'signed-out');
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setBootstrap('signed-out');
      });

    return () => {
      active = false;
    };
  }, [setBootstrap, setUser]);

  return null;
}
