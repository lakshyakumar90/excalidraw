import type { Element, Point } from "@repo/common";
import {
  getBoundsCenter,
  getElementLocalBounds,
  rotatePoint,
} from "@repo/engine";
import type { ResizeHandle } from "./handles";

const MIN_SIZE = 1;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ResizeBoundsResult {
  bounds: Bounds;
  flipX: boolean;
  flipY: boolean;
}

function resizeBounds(
  original: Bounds,
  pointer: Point,
  handle: ResizeHandle,
  shiftKey: boolean,
  altKey: boolean,
): ResizeBoundsResult {
  const originalWidth = original.maxX - original.minX;
  const originalHeight = original.maxY - original.minY;
  const centerX = (original.minX + original.maxX) / 2;
  const centerY = (original.minY + original.maxY) / 2;
  const horizontal = handle.includes("w") || handle.includes("e");
  const vertical = handle.includes("n") || handle.includes("s");
  const left = handle.includes("w");
  const top = handle.includes("n");

  // Never invert or grow again while resizing. These are signed distances in
  // the handle's outward direction: they turn negative once the cursor crosses
  // the anchored edge (or the center with Alt). Clamping them at zero means the
  // size stops at MIN_SIZE instead of expanding in the opposite direction.
  const flipX = false;
  const flipY = false;
  const outwardX = Math.max(
    0,
    left ? original.maxX - pointer.x : pointer.x - original.minX,
  );
  const outwardY = Math.max(
    0,
    top ? original.maxY - pointer.y : pointer.y - original.minY,
  );
  const centerOutwardX = Math.max(
    0,
    left ? centerX - pointer.x : pointer.x - centerX,
  );
  const centerOutwardY = Math.max(
    0,
    top ? centerY - pointer.y : pointer.y - centerY,
  );

  const aspectRatio =
    originalWidth > 0 && originalHeight > 0
      ? originalWidth / originalHeight
      : 1;

  let width = originalWidth;
  let height = originalHeight;

  if (shiftKey && horizontal && vertical) {
    if (altKey) {
      const scaleX =
        centerOutwardX / Math.max(originalWidth / 2, MIN_SIZE / 2);
      const scaleY =
        centerOutwardY / Math.max(originalHeight / 2, MIN_SIZE / 2);
      const scale = Math.max(scaleX, scaleY);
      width = Math.max(MIN_SIZE, originalWidth * scale);
      height = Math.max(MIN_SIZE, originalHeight * scale);
    } else {
      const scaleX = outwardX / Math.max(originalWidth, MIN_SIZE);
      const scaleY = outwardY / Math.max(originalHeight, MIN_SIZE);
      const scale = Math.max(scaleX, scaleY);
      width = Math.max(MIN_SIZE, originalWidth * scale);
      height = Math.max(MIN_SIZE, originalHeight * scale);
    }
  } else if (shiftKey && horizontal !== vertical) {
    if (horizontal) {
      width = Math.max(
        MIN_SIZE,
        altKey ? 2 * centerOutwardX : outwardX,
      );
      height = Math.max(MIN_SIZE, width / aspectRatio);
    } else {
      height = Math.max(
        MIN_SIZE,
        altKey ? 2 * centerOutwardY : outwardY,
      );
      width = Math.max(MIN_SIZE, height * aspectRatio);
    }
  } else {
    if (horizontal) {
      width = Math.max(MIN_SIZE, altKey ? 2 * centerOutwardX : outwardX);
    }

    if (vertical) {
      height = Math.max(MIN_SIZE, altKey ? 2 * centerOutwardY : outwardY);
    }
  }

  let minX: number;
  let maxX: number;
  let minY: number;
  let maxY: number;

  if (altKey || (shiftKey && vertical && !horizontal)) {
    minX = centerX - width / 2;
    maxX = centerX + width / 2;
  } else if (!horizontal) {
    minX = original.minX;
    maxX = original.maxX;
  } else {
    const fixedX = left ? original.maxX : original.minX;
    const activeSideIsLeft = left;

    if (activeSideIsLeft) {
      maxX = fixedX;
      minX = fixedX - width;
    } else {
      minX = fixedX;
      maxX = fixedX + width;
    }
  }

  if (altKey || (shiftKey && horizontal && !vertical)) {
    minY = centerY - height / 2;
    maxY = centerY + height / 2;
  } else if (!vertical) {
    minY = original.minY;
    maxY = original.maxY;
  } else {
    const fixedY = top ? original.maxY : original.minY;
    const activeSideIsTop = top;

    if (activeSideIsTop) {
      maxY = fixedY;
      minY = fixedY - height;
    } else {
      minY = fixedY;
      maxY = fixedY + height;
    }
  }

  return {
    bounds: { minX, minY, maxX, maxY },
    flipX,
    flipY,
  };
}

function localToWorld(
  element: Element,
  localPoint: Point,
  localCenter: Point,
): Point {
  const rotated = rotatePoint(localPoint, element.angle ?? 0, localCenter);
  return {
    x: element.x + rotated.x,
    y: element.y + rotated.y,
  };
}

export function resizeElement(
  element: Element,
  handle: ResizeHandle,
  worldPointer: Point,
  shiftKey: boolean,
  altKey: boolean,
): Element {
  const originalBounds = getElementLocalBounds(element);
  const originalCenter = getBoundsCenter(originalBounds);
  const worldCenter = {
    x: element.x + originalCenter.x,
    y: element.y + originalCenter.y,
  };

  // Undo the element's rotation so resizing can be calculated in its local frame.
  const unrotatedPointer = rotatePoint(
    worldPointer,
    -(element.angle ?? 0),
    worldCenter,
  );
  const localPointer = {
    x: unrotatedPointer.x - element.x,
    y: unrotatedPointer.y - element.y,
  };

  const resizeResult = resizeBounds(
    originalBounds,
    localPointer,
    handle,
    shiftKey,
    altKey,
  );
  const resizedBounds = resizeResult.bounds;
  const { flipX, flipY } = resizeResult;
  // Shape renderers draw rectangle, ellipse, diamond, and text geometry from
  // local origin (0, 0). Keep those resized bounds normalized to that origin.
  // Linear elements instead store their actual local point coordinates.
  const nextBounds: Bounds =
    "points" in element
      ? resizedBounds
      : {
          minX: 0,
          minY: 0,
          maxX: resizedBounds.maxX - resizedBounds.minX,
          maxY: resizedBounds.maxY - resizedBounds.minY,
        };
  const nextCenter = getBoundsCenter(nextBounds);
  const horizontal = handle.includes("w") || handle.includes("e");
  const vertical = handle.includes("n") || handle.includes("s");
  const left = handle.includes("w");
  const top = handle.includes("n");

  // Find the point that must stay fixed. Alt uses the center; otherwise the
  // opposite side/corner stays anchored while the dragged handle moves.
  const fixedOriginalLocal = {
    x: altKey
      ? originalCenter.x
      : horizontal
        ? left
          ? originalBounds.maxX
          : originalBounds.minX
        : originalCenter.x,
    y: altKey
      ? originalCenter.y
      : vertical
        ? top
          ? originalBounds.maxY
          : originalBounds.minY
        : originalCenter.y,
  };
  const fixedNextLocal = {
    x: altKey
      ? nextCenter.x
      : horizontal
        ? left !== flipX
          ? nextBounds.maxX
          : nextBounds.minX
        : nextCenter.x,
    y: altKey
      ? nextCenter.y
      : vertical
        ? top !== flipY
          ? nextBounds.maxY
          : nextBounds.minY
        : nextCenter.y,
  };

  const fixedWorld = localToWorld(element, fixedOriginalLocal, originalCenter);
  const transformedFixed = rotatePoint(
    fixedNextLocal,
    element.angle ?? 0,
    nextCenter,
  );
  const nextX = fixedWorld.x - transformedFixed.x;
  const nextY = fixedWorld.y - transformedFixed.y;
  const nextWidth = nextBounds.maxX - nextBounds.minX;
  const nextHeight = nextBounds.maxY - nextBounds.minY;

  const resized = {
    ...element,
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight,
  } as Element;

  if (!("points" in element)) return resized;

  const oldWidth = originalBounds.maxX - originalBounds.minX;
  const oldHeight = originalBounds.maxY - originalBounds.minY;
  const scaleX = oldWidth === 0 ? 1 : nextWidth / oldWidth;
  const scaleY = oldHeight === 0 ? 1 : nextHeight / oldHeight;

  return {
    ...resized,
    points: element.points.map((point) => ({
      ...point,
      x:
        oldWidth === 0
          ? nextCenter.x
          : flipX
            ? nextBounds.maxX - (point.x - originalBounds.minX) * scaleX
            : nextBounds.minX + (point.x - originalBounds.minX) * scaleX,
      y:
        oldHeight === 0
          ? nextCenter.y
          : flipY
            ? nextBounds.maxY - (point.y - originalBounds.minY) * scaleY
            : nextBounds.minY + (point.y - originalBounds.minY) * scaleY,
    })),
  } as Element;
}
