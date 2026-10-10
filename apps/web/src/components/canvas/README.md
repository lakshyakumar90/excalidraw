# canvas

Next.js editor, account dashboard, and room access interface.

## Subfolders

- [text](./text/README.md)

## Files

- `Canvas.tsx`
- `CanvasContextMenu.tsx`
- `CanvasControls.tsx`
- `CanvasDebugHud.tsx`
- `CanvasWorkspace.tsx`
- `EditorExtras.tsx`
- `EditorActionsMenu.tsx`
- `PersonalLibraryPanel.tsx`
- `HelpDialog.tsx`
- `RendererBenchmark.tsx`

`EditorExtras` coordinates search, selection navigation, layout controls, and zen mode. The secondary action menu and account/device library panel own their UI and async state separately.

The top navigation/tools/account composition lives in [editor](../editor/README.md); responsive chrome rules live in `src/styles/editor.css`.

## Working here

Keep changes within this folder’s responsibility. Follow the owning app/package README for setup and checks; use shared packages for reusable logic. Do not edit build output or store credentials here.
