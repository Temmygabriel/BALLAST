/**
 * StateBus — a tiny broadcast channel. Producers (the simulator or the live
 * monitor) publish fresh instrument states; consumers (the SSE server) subscribe.
 */
import type { InstrumentState } from './types';

export type StateListener = (s: InstrumentState) => void;

export class StateBus {
  private listeners = new Set<StateListener>();
  private latest: InstrumentState | null = null;

  publish(s: InstrumentState) {
    this.latest = s;
    for (const fn of this.listeners) fn(s);
  }

  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    if (this.latest) fn(this.latest);
    return () => this.listeners.delete(fn);
  }

  get(): InstrumentState | null {
    return this.latest;
  }
}
