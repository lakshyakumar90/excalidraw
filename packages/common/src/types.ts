export interface Point{
  x: number,
  y: number,
}

export interface Viewport {
  scrollX: number,
  scrollY: number,
  zoom: number,
}

export interface Size {
  width: number,
  height: number,
}
export type RoomRole = "owner" | "editor" | "viewer";

export function safeRoomAuthReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 2_048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) return "/dashboard";
  try {
    const decoded = decodeURIComponent(value);
    const path = new URL(value, "https://app.invalid");
    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      path.origin !== "https://app.invalid" ||
      (!path.pathname.startsWith("/invite/") &&
        !path.pathname.startsWith("/join/"))
    ) return "/dashboard";
    return `${path.pathname}${path.search}${path.hash}`;
  } catch {
    return "/dashboard";
  }
}
