# Web application styles

## Files

- `editor.css` — editor chrome placement, safe-area spacing, compact panels, and responsive breakpoints.
- `dashboard.css` — workspace, sign-in, invitation inbox, and room-management layout across desktop and mobile.

`app/globals.css` owns Tailwind, base font setup, and global focus/reduced-motion behavior. Keep editor and dashboard layout rules in their respective stylesheets instead of adding overlapping media-query blocks to the global stylesheet.
