/** Run serially so a slow/outage scan cannot accumulate overlapping requests. */
export function startMaintenance(
  task: () => Promise<void>,
  intervalMs: number,
  onError: (error: unknown) => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    try {
      await task();
    } catch (error) {
      onError(error);
    } finally {
      if (!stopped) {
        timer = setTimeout(() => void run(), intervalMs);
        timer.unref?.();
      }
    }
  };
  void run();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
