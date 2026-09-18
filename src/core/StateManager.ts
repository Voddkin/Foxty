import { FoxtyState } from '../types.js';

export class StateManager {
  private state: FoxtyState;

  constructor(initialState: FoxtyState) {
    this.state = { ...initialState };
  }

  public getState(): FoxtyState {
    return { ...this.state };
  }

  public update(patch: Partial<FoxtyState>): FoxtyState {
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === 'number' && key in this.state) {
        // Clamp between 0.0 and 1.0
        const k = key as keyof FoxtyState;
        this.state[k] = Math.max(0.0, Math.min(1.0, Number(value.toFixed(2))));
      }
    }
    return this.getState();
  }

  public adjust(delta: Partial<Record<keyof FoxtyState, number>>): FoxtyState {
    for (const [key, change] of Object.entries(delta)) {
      if (typeof change === 'number' && key in this.state) {
        const k = key as keyof FoxtyState;
        this.state[k] = Math.max(0.0, Math.min(1.0, Number((this.state[k] + change).toFixed(2))));
      }
    }
    return this.getState();
  }

  public reset(defaultState: FoxtyState): void {
    this.state = { ...defaultState };
  }
}
