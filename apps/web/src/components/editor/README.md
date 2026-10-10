# Editor composition

## Files

- `EditorHeader.tsx` — navigation/scene context, centered tools, and account slot.

Canvas drawing stays in `components/canvas`; toolbar behavior stays in `components/toolbar`. The header only composes those controls into their responsive layout slots.
