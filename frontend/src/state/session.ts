import { create } from 'zustand';
import type { User } from '../api/types';

type BootstrapState = 'idle' | 'loading' | 'ready' | 'signed-out';

type SessionState = {
  user: User | null;
  bootstrap: BootstrapState;
  setUser: (user: User | null) => void;
  setBootstrap: (state: BootstrapState) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  bootstrap: 'idle',
  setUser: (user) => set({ user }),
  setBootstrap: (bootstrap) => set({ bootstrap }),
}));
