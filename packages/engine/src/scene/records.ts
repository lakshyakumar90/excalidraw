import type { Element } from "@repo/common";
export function cloneElement(element: Element): Element {
  return "points" in element
    ? ({
        ...element,
        points: element.points.map((point) => ({ ...point })),
      } as Element)
    : { ...element };
}

export function pickFields(
  element: Element,
  fields: Iterable<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { type: element.type };
  for (const field of fields) {
    if (field === "id" || field === "type") continue;
    const value = element[field as keyof Element];
    result[field] = Array.isArray(value) ? structuredClone(value) : value;
  }
  return result;
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function freshNonce(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

export function orderKeyOf(element: Element, fallback: number): number {
  return typeof element.orderKey === "number" &&
    Number.isFinite(element.orderKey)
    ? element.orderKey
    : fallback;
}
