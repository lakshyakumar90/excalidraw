import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import type { SavedScene } from "@/lib/api/scenes";
import {
  findGuestImport,
  readGuestDrawing,
  saveGuestDrawing,
  type GuestDrawing,
} from "@/lib/persistence/guestImport";

export function useGuestImport(
  userId: string,
  onSaved: (scene: SavedScene) => void,
) {
  const [drawing, setDrawing] = useState<GuestDrawing | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function detect() {
      try {
        const guest = await readGuestDrawing();
        if (!guest) return;
        const existing = await findGuestImport(guest.importKey);
        if (!cancelled && !existing) setDrawing(guest);
      } catch (error) {
        if (!cancelled)
          setError(errorMessage(error, "Could not read your guest drawing"));
      }
    }
    void detect();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function save() {
    if (!drawing || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await saveGuestDrawing(drawing);
      onSaved(saved);
      setSavedId(saved.id);
      setDrawing(null);
    } catch (error) {
      setError(errorMessage(error, "Could not save your guest drawing"));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return {
    drawing,
    saving,
    savedId,
    error,
    save,
    dismiss: () => setDrawing(null),
  };
}
