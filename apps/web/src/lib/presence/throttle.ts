/**
 * Throttled presence publishing with a trailing update.
 * Batches rapid pointer/viewport changes to ~1 message per interval and
 * always delivers the latest value shortly after movement stops.
 */

export interface ThrottledPublisher<T> {
  push: (value: T) => void;
  /** Deliver any pending value immediately. */
  flush: () => void;
  /** Drop any pending value (for example on pointer leave). */
  cancel: () => void;
}

export function createThrottledPublisher<T>(
  intervalMs: number,
  publish: (value: T) => void,
): ThrottledPublisher<T> {
  let lastSent = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;
  let hasPending = false;

  const deliver = (value: T) => {
    lastSent = Date.now();
    publish(value);
  };

  return {
    push(value: T) {
      const now = Date.now();
      if (timer === null && now - lastSent >= intervalMs) {
        deliver(value);
        return;
      }
      pending = value;
      hasPending = true;
      if (timer === null) {
        const wait = Math.max(0, intervalMs - (now - lastSent));
        timer = setTimeout(() => {
          timer = null;
          if (hasPending) {
            hasPending = false;
            const valueToSend = pending as T;
            pending = null;
            deliver(valueToSend);
          }
        }, wait);
      }
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (hasPending) {
        hasPending = false;
        const valueToSend = pending as T;
        pending = null;
        deliver(valueToSend);
      }
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
      hasPending = false;
    },
  };
}
