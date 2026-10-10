# Web application styles

## Files

- `editor.css` — editor chrome placement, safe-area spacing, compact panels, and responsive breakpoints.

`app/globals.css` owns Tailwind, base colors, font setup, and global focus/reduced-motion behavior. Keep editor layout rules here instead of adding another overlapping media-query block to the global stylesheet.
