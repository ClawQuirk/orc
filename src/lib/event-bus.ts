type Callback = (...args: any[]) => void;

const listeners = new Map<string, Set<Callback>>();

export const eventBus = {
  on(event: string, cb: Callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(cb);
  },
  off(event: string, cb: Callback) {
    listeners.get(event)?.delete(cb);
  },
  emit(event: string, ...args: any[]) {
    listeners.get(event)?.forEach((cb) => cb(...args));
  },
};
