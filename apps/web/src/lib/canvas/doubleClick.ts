import type { RefObject } from "react";
import type { Element, Point, Viewport } from "@repo/common";
import {
  createTextElement,
  getArrowMidpoint,
  getElementAtPosition,
  measureText,
  RenderLoop,
  viewportToScene,
} from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { toolManager } from "@/lib/tools/toolManager";
import { styleStore } from "@/lib/styles/styleStore";
import { historyStore } from "@/lib/history/historyStore";
import { commitHistoryEntry } from "@/lib/sync/commits";
import { selectionController } from "@/lib/selection/selectionController";
import {
  commitTextElement,
  type TextEditorState,
} from "@/components/canvas/text/TextEditorOverlay";

interface DoubleClickOptions {
  getPointerPosition: (event: MouseEvent) => Point;
  viewportRef: RefObject<Viewport>;
  textEditorRef: RefObject<TextEditorState | null>;
  setTextEditorPosition: (editor: TextEditorState) => void;
  renderLoop: RenderLoop;
}

export function createCanvasDoubleClickHandler({
  getPointerPosition,
  viewportRef,
  textEditorRef,
  setTextEditorPosition,
  renderLoop,
}: DoubleClickOptions) {
  return (event: MouseEvent) => {
    if (toolManager.getActiveTool() === "multiPointLine") {
      event.preventDefault();
      const { changes } = historyStore.commitUpdate(() => toolManager.commit());
      commitHistoryEntry(changes, "local");
      renderLoop.invalidateInteractive();
      return;
    }
    if (toolManager.getActiveTool() !== "selection") return;
    event.preventDefault();
    const point = getPointerPosition(event);
    const scenePoint = viewportToScene(point, viewportRef.current);
    const hitElement = getElementAtPosition(
      scene.getElements(),
      scenePoint,
      viewportRef.current.zoom,
    );
    const container =
      hitElement?.type === "rectangle" || hitElement?.type === "arrow"
        ? hitElement
        : hitElement?.type === "text" && hitElement.containerId
          ? scene.getElement(hitElement.containerId)
          : undefined;

    if (container?.type === "rectangle" || container?.type === "arrow") {
      commitTextElement(textEditorRef.current);
      let createdText = false;
      let textElement = scene
        .getElements()
        .find(
          (element): element is Extract<Element, { type: "text" }> =>
            element.type === "text" &&
            element.containerId === container.id &&
            !element.isDeleted,
        );

      if (!textElement) {
        createdText = true;
        historyStore.startCapture();
        if (container.type === "rectangle") {
          textElement = createTextElement({
            text: "",
            x: container.x,
            y: container.y,
            width: container.width,
            height: container.height,
            angle: container.angle,
            textAlign: "center",
            verticalAlign: "middle",
            containerId: container.id,
          });
        } else {
          const midpoint = getArrowMidpoint(container);
          const emptyTextMetrics = measureText("");
          textElement = createTextElement({
            text: "",
            x: midpoint.x - 10,
            y: midpoint.y - emptyTextMetrics.height / 2,
            width: 20,
            height: emptyTextMetrics.height,
            textAlign: "center",
            verticalAlign: "middle",
            containerId: container.id,
          });
        }
        scene.addElement({
          ...textElement,
          ...styleStore.getElementStyle(),
        });
        scene.mutateElement(container.id, {
          boundElements: [
            ...new Set([...(container.boundElements ?? []), textElement.id]),
          ],
        });
      }

      if (!createdText) {
        historyStore.startCapture();
      }
      const editor: TextEditorState = {
        elementId: textElement.id,
        containerId: container.id,
        wrapText: textElement.wrapText,
        angle: textElement.angle ?? 0,
        fontSize: textElement.fontSize,
        fontFamily: textElement.fontFamily,
        textAlign: textElement.textAlign,
        verticalAlign: textElement.verticalAlign,
        sceneX: textElement.x,
        sceneY: textElement.y,
        value: textElement.text,
        inputWidth:
          textElement.width ??
          (container.type === "rectangle" ? container.width : undefined) ??
          20,
        inputHeight:
          textElement.height ??
          (container.type === "rectangle" ? container.height : undefined) ??
          24,
      };
      textEditorRef.current = editor;
      setTextEditorPosition(editor);
      return;
    }

    if (hitElement?.type === "text") {
      commitTextElement(textEditorRef.current);
      historyStore.startCapture();
      const editor: TextEditorState = {
        elementId: hitElement.id,
        wrapText: hitElement.wrapText,
        angle: hitElement.angle ?? 0,
        fontSize: hitElement.fontSize,
        fontFamily: hitElement.fontFamily,
        textAlign: hitElement.textAlign,
        verticalAlign: hitElement.verticalAlign,
        sceneX: hitElement.x,
        sceneY: hitElement.y,
        value: hitElement.text,
        inputWidth:
          hitElement.width ??
          measureText(
            hitElement.text,
            hitElement.fontSize,
            hitElement.fontFamily,
          ).width,
        inputHeight: hitElement.height ?? 24,
      };
      textEditorRef.current = editor;
      setTextEditorPosition(editor);
      return;
    }

    if (hitElement && (hitElement.groupIds?.length ?? 0) > 0) {
      selectionController.handleDoubleClick(
        scenePoint,
        viewportRef.current.zoom,
      );
      renderLoop.invalidateInteractive();
      return;
    }

    commitTextElement(textEditorRef.current);
    historyStore.startCapture();
    const textElement = createTextElement({
      text: "",
      x: scenePoint.x,
      y: scenePoint.y,
    });
    scene.addElement({
      ...textElement,
      ...styleStore.getElementStyle(),
    });
    const editor: TextEditorState = {
      elementId: textElement.id,
      angle: textElement.angle ?? 0,
      fontSize: textElement.fontSize,
      fontFamily: textElement.fontFamily,
      textAlign: textElement.textAlign,
      verticalAlign: textElement.verticalAlign,
      sceneX: scenePoint.x,
      sceneY: scenePoint.y,
      value: "",
      inputWidth: 20,
      inputHeight: 24,
    };
    textEditorRef.current = editor;
    setTextEditorPosition(editor);
  };
}
