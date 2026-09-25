import { getActivation } from '../api/activations';
import type { Activation } from '../api/types';

export type ActivationListener = (activation: Activation) => void;

export interface ActivationStream {
  subscribe(activationId: string, listener: ActivationListener): () => void;
}

class PollingActivationStream implements ActivationStream {
  subscribe(activationId: string, listener: ActivationListener) {
    let disposed = false;

    const tick = async () => {
      try {
        const activation = await getActivation(activationId);
        if (!disposed) listener(activation);
      } catch {
        // Query/UI state owns transport error presentation.
      }
    };

    void tick();
    const interval = window.setInterval(() => void tick(), 2000);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }
}

export const activationStream: ActivationStream =
  new PollingActivationStream();
