"use client";

import { useSyncExternalStore, useState, type FormEvent } from "react";
import { selectionController } from "@/lib/selection/selectionController";
import { textEditStore, type TextEditRequest } from "@/lib/selection/textEditStore";

function Dialog({ request }: { request: TextEditRequest }) {
  const [text, setText] = useState(request.text);

  const cancel = () => selectionController.cancelTextEdit();
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    selectionController.saveTextEdit(text);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) cancel();
    }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-edit-title"
        onSubmit={save}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl"
      >
        <h2 id="text-edit-title" className="text-base font-semibold text-neutral-900">
          Edit text
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          {request.editsShapeLabel ? "Text inside the selected shape" : "Update the selected text"}
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          className="mt-4 w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          aria-label="Text content"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={cancel} className="rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

export function TextEditDialog() {
  const request = useSyncExternalStore(
    textEditStore.subscribe,
    textEditStore.getSnapshot,
    () => null,
  );

  return request ? <Dialog key={request.targetElementId} request={request} /> : null;
}
