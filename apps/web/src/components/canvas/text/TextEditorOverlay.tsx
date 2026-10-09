import { useRef, useState } from "react";
import type { Viewport } from "@repo/common";
import { getArrowMidpoint, measureText, sceneToViewport } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { historyStore } from "@/lib/history/historyStore";
import { commitHistoryEntry } from "@/lib/sync/commits";

export interface TextEditorState {
  elementId: string;
  containerId?: string;
  wrapText?: boolean;
  angle: number;
  fontSize: number;
  fontFamily: string;
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  sceneX: number;
  sceneY: number;
  value: string;
  inputWidth: number;
  inputHeight: number;
}

export function commitTextElement(editor: TextEditorState | null): void {
  if (editor && editor.value.length === 0) {
    scene.removeElement(editor.elementId);
  }
  commitHistoryEntry(historyStore.endCapture(), "local");
}

export function TextEditorOverlay({
  initialEditor,
  viewport,
  onUpdate,
  onClose,
}: {
  initialEditor: TextEditorState;
  viewport: Viewport;
  onUpdate: (editor: TextEditorState) => void;
  onClose: () => void;
}) {
  const [editor, setEditor] = useState(initialEditor);
  const [caretIndex, setCaretIndex] = useState(initialEditor.value.length);
  const editorRef = useRef<TextEditorState | null>(initialEditor);
  const screenPosition = sceneToViewport(
    { x: editor.sceneX, y: editor.sceneY },
    viewport,
  );
  const textElement = scene.getElement(editor.elementId);
  const caretColor =
    textElement?.type === "text"
      ? (textElement.strokeColor ?? "#1e1e1e")
      : "#1e1e1e";
  const textLayout = measureText(
    editor.value,
    editor.fontSize,
    editor.fontFamily,
    editor.wrapText || editor.containerId ? editor.inputWidth : undefined,
  );
  const verticalOffset =
    editor.verticalAlign === "middle"
      ? ((textElement?.height ?? textLayout.height) - textLayout.height) / 2
      : editor.verticalAlign === "bottom"
        ? (textElement?.height ?? textLayout.height) - textLayout.height
        : 0;
  const wrapWidth =
    editor.wrapText || editor.containerId ? editor.inputWidth : undefined;
  const caretPrefix = editor.value.slice(0, caretIndex);
  const caretLayout = measureText(
    caretPrefix,
    editor.fontSize,
    editor.fontFamily,
    wrapWidth,
  );
  const caretLine = caretLayout.lines.at(-1) ?? "";
  const caretLineWidth = measureText(
    caretLine,
    editor.fontSize,
    editor.fontFamily,
  ).width;
  const caretLineX =
    editor.textAlign === "center"
      ? (editor.inputWidth - caretLineWidth) / 2
      : editor.textAlign === "right"
        ? editor.inputWidth - caretLineWidth
        : 0;
  const caretX = caretLineX + caretLineWidth;
  const caretY =
    Math.max(0, verticalOffset) +
    Math.max(0, caretLayout.lines.length - 1) * textLayout.lineHeight;

  const finish = () => {
    const current = editorRef.current;
    if (!current) return;
    commitTextElement(current);
    editorRef.current = null;
    onClose();
  };

  const frame = scene
    .getElements()
    .find(
      (e) =>
        e.id === textElement?.frameId && e.type === "frame" && !e.isDeleted,
    );
  const frameTop = frame
    ? sceneToViewport({ x: frame.x, y: frame.y }, viewport)
    : null;
  return (
    <div
      className="fixed inset-0 pointer-events-none z-20"
      style={
        frame && frameTop
          ? {
              clipPath: `inset(${frameTop.y}px ${window.innerWidth - frameTop.x - (frame.width ?? 0) * viewport.zoom}px ${window.innerHeight - frameTop.y - (frame.height ?? 0) * viewport.zoom}px ${frameTop.x}px)`,
            }
          : undefined
      }
    >
      <div
        className="absolute z-20 pointer-events-none"
        style={{
          left: screenPosition.x,
          top: screenPosition.y,
          width: editor.inputWidth * viewport.zoom,
          height: editor.inputHeight * viewport.zoom,
          transform: `rotate(${editor.angle}rad)`,
          transformOrigin: "center center",
        }}
      >
        <textarea
          aria-label="Text input"
          autoFocus
          defaultValue={initialEditor.value}
          wrap={editor.wrapText || editor.containerId ? "soft" : "off"}
          onFocus={(event) => {
            const end = event.currentTarget.value.length;
            event.currentTarget.setSelectionRange(end, end);
            setCaretIndex(end);
          }}
          onSelect={(event) =>
            setCaretIndex(event.currentTarget.selectionStart)
          }
          onChange={(event) => {
            const current = editorRef.current;
            if (!current) return;
            const value = event.currentTarget.value;
            setCaretIndex(event.currentTarget.selectionStart);
            const container = current.containerId
              ? scene.getElement(current.containerId)
              : undefined;
            const maxWidth =
              container?.type === "rectangle"
                ? (container.width ?? 0)
                : current.wrapText
                  ? current.inputWidth
                  : undefined;
            const measured = measureText(
              value,
              current.fontSize,
              current.fontFamily,
              maxWidth,
            );
            const inputWidth = Math.max(20, maxWidth ?? measured.width);
            const arrowMidpoint =
              container?.type === "arrow" ? getArrowMidpoint(container) : null;
            const sceneX = arrowMidpoint
              ? arrowMidpoint.x - inputWidth / 2
              : current.sceneX;
            const sceneY = arrowMidpoint
              ? arrowMidpoint.y - measured.height / 2
              : current.sceneY;
            const zoom = viewport.zoom;
            event.currentTarget.style.height = "auto";
            const inputHeight = Math.max(
              event.currentTarget.scrollHeight / zoom,
              measured.height,
            );
            const containerHeight =
              container?.type === "rectangle"
                ? Math.max(container.height ?? 0, measured.height)
                : current.wrapText
                  ? Math.max(
                      scene.getElement(current.elementId)?.height ?? 0,
                      measured.height,
                    )
                  : measured.height;
            if (
              container?.type === "rectangle" &&
              containerHeight > (container.height ?? 0)
            ) {
              scene.mutateElement(container.id, { height: containerHeight });
            }
            scene.mutateElement(current.elementId, {
              text: value,
              width: maxWidth ?? inputWidth,
              x: sceneX,
              y: sceneY,
              height: containerHeight,
            });
            const nextEditor = {
              ...current,
              sceneX,
              sceneY,
              value,
              inputWidth,
              inputHeight:
                container?.type === "rectangle" || current.wrapText
                  ? Math.max(containerHeight, inputHeight)
                  : inputHeight,
            };
            editorRef.current = nextEditor;
            setEditor(nextEditor);
            onUpdate(nextEditor);
          }}
          onKeyDown={(event) => {
            const isEscape = event.key === "Escape";
            const isCommitShortcut =
              event.key === "Enter" && (event.ctrlKey || event.metaKey);
            if (!isEscape && !isCommitShortcut) return;
            event.preventDefault();
            event.stopPropagation();
            finish();
          }}
          onBlur={finish}
          spellCheck={false}
          className="absolute inset-0 resize-none cursor-text overflow-hidden border-0 bg-transparent p-0 text-transparent outline-none pointer-events-auto"
          style={{
            width: "100%",
            height: "100%",
            fontSize: editor.fontSize * viewport.zoom,
            fontFamily: editor.fontFamily,
            lineHeight: `${editor.fontSize * 1.2 * viewport.zoom}px`,
            textAlign: editor.textAlign,
            paddingTop: `${Math.max(0, verticalOffset) * viewport.zoom}px`,
            caretColor: "transparent",
          }}
        />
        <span
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            left: caretX * viewport.zoom,
            top: caretY * viewport.zoom,
            width: Math.max(1, viewport.zoom),
            height: textLayout.lineHeight * viewport.zoom,
            backgroundColor: caretColor,
            animation: "text-editor-caret-blink 1s step-end infinite",
          }}
        />
      </div>
    </div>
  );
}
