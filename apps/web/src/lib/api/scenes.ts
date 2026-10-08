import type { Element, Viewport } from "@repo/common";

import { apiRequest } from "./request";

export interface SceneData {
  elements: Element[];
  appState?: {
    scrollX?: number;
    scrollY?: number;
    zoom?: number | { value?: number };
    [key: string]: unknown;
  };
  files?: Record<string, SceneFileData>;
}

export interface SceneFileData {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
}

export interface SavedScene {
  id: string;
  title: string;
  data: SceneData;
  createdAt: string;
  updatedAt: string;
}

export interface SceneSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export async function listScenes(): Promise<SceneSummary[]> {
  const result = await apiRequest<{ scenes: SceneSummary[] }>("/scenes");
  return result.scenes;
}

export async function getScene(sceneId: string): Promise<SavedScene> {
  const result = await apiRequest<{ scene: SavedScene }>(
    `/scenes/${encodeURIComponent(sceneId)}`,
  );
  return result.scene;
}

export async function createScene(
  title: string,
  data: SceneData,
): Promise<SavedScene> {
  const result = await apiRequest<{ scene: SavedScene }>("/scenes", {
    method: "POST",
    body: JSON.stringify({ title, data }),
  });
  return result.scene;
}

export async function updateSceneData(
  sceneId: string,
  data: SceneData,
): Promise<void> {
  await apiRequest(`/scenes/${encodeURIComponent(sceneId)}`, {
    method: "PATCH",
    body: JSON.stringify({ data }),
  });
}

export function viewportFromSceneData(data: SceneData): Viewport {
  const appState = data.appState;
  const zoomValue =
    typeof appState?.zoom === "number" ? appState.zoom : appState?.zoom?.value;
  return {
    scrollX: Number.isFinite(appState?.scrollX) ? appState!.scrollX! : 0,
    scrollY: Number.isFinite(appState?.scrollY) ? appState!.scrollY! : 0,
    zoom: Number.isFinite(zoomValue) && zoomValue! > 0 ? zoomValue! : 1,
  };
}
