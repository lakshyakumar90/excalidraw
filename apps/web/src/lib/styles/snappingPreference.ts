const EVENT = "editor-snap-preference";
export function subscribeSnapPreference(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
export function readSnapPreference() {
  return localStorage.getItem("editor-object-snap") !== "false";
}
export function writeSnapPreference(value: boolean) {
  localStorage.setItem("editor-object-snap", String(value));
  window.dispatchEvent(new Event(EVENT));
}
