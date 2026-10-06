type Listener = () => void;

const MAX_RECENT_COLORS = 8;
const listeners = new Set<Listener>();
let recentColors: string[] = [];

function notify(): void {
  for (const listener of listeners) listener();
}

export const colorHistoryStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): readonly string[] {
    return recentColors;
  },

  add(color: string): void {
    if (!/^#[\da-f]{6}$/i.test(color)) return;

    const nextColors = [
      color.toLowerCase(),
      ...recentColors.filter(
        (recentColor) => recentColor.toLowerCase() !== color.toLowerCase(),
      ),
    ].slice(0, MAX_RECENT_COLORS);

    if (
      nextColors.every(
        (recentColor, index) => recentColors[index] === recentColor,
      )
    ) {
      return;
    }

    recentColors = nextColors;
    notify();
  },
};
