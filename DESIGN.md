---
name: Collaborative drawing workspace
description: Compact, consistent controls that leave the drawing surface clear.
colors:
  canvas: "#faf9f6"
  surface: "#ffffff"
  ink: "#171717"
  focus: "#4c6ef5"
typography:
  body:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.25
rounded:
  control: "8px"
  panel: "12px"
spacing:
  tight: "4px"
  compact: "8px"
  normal: "12px"
  section: "16px"
  page: "24px"
components:
  button-neutral:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "8px 12px"
  button-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "44px"
---

# Design System: Collaborative drawing workspace

## Overview

**Creative North Star: "A clear drawing desk"**

This is a refinement of the existing interface. Preserve Geist Mono, the warm canvas, white control surfaces, familiar tool icons, and existing account flows. Use the dashboard's clear grouping as the reference for controls throughout the application.

The intended result is compact and orderly: related controls share a container, secondary features appear on demand, and panels have clear boundaries. The implementation is moving toward this contract in small slices; the verified summary records what is complete and what still needs browser review.

Key characteristics:

- Small visible chrome with usable touch targets.
- Centered labels and stable control positions.
- Shared button, panel, border, and spacing treatments.
- Drawing space remains the primary surface.
- Existing editor functions remain discoverable.

## Colors

### Primary

Ink is the neutral foreground and selected drawing-tool treatment. Focus blue identifies keyboard focus rather than decorative emphasis.

### Neutral

Use the canvas token for the drawing area and surface token for controls, panels, and account forms. Consolidate repeated foreground, muted text, border, disabled, and hover colors into semantic CSS variables during implementation, using the current dashboard palette as the source.

Preserve the dashboard's existing violet action accent and semantic error/success colors. Extract their actual computed values before adding them to the token layer; do not substitute guessed Tailwind values. Drawing-element colors are document content and remain independent of UI tokens.

**The State Rule.** Selected, focused, disabled, loading, and error treatments must remain distinguishable. Verify text contrast on each actual background.

## Typography

**The Existing Font Rule.** Keep Geist Mono throughout the product chrome. The running application was inspected and resolves to Geist Mono with its existing fallback. Do not replace it with Geist Sans or add another display font. Element text retains its document-selected font.

- Page headings: 24–28px, semibold; use the smaller size on phones.
- Panel headings: 14px, semibold.
- Forms and mobile inputs: 16px to avoid mobile browser auto-zoom.
- Ordinary interface copy: body token.
- Compact labels and helper text: label token; avoid shrinking essential actions below 12px to force a layout to fit.
- Use natural line height and neutral tracking. Do not fake vertical alignment with extra top padding or positional offsets.

## Layout

**The Anchored Chrome Rule.** Editor chrome occupies a top header and one bottom dock. No permanent action strip floats halfway up the right edge. Panels attach to their trigger region and avoid obscuring those two anchors.

### Editor header

- Left slot: navigation/back, when relevant, and scene context.
- Center slot: full drawing toolbar on wide screens; a small centered active-tool picker on compact screens.
- Right slot: account/share/access controls appropriate to the current scene.
- The center is relative to the available header layout and stays visually centered when side slots have unequal content. Use explicit grid slots; independently fixed offsets must not overlap.
- Desktop drawing tools may wrap into balanced rows when necessary. On compact screens, opening the picker reveals a centered grid containing every tool, with no forced horizontal scrolling.
- Keep all document/editing actions available in read-only-compatible form. Never show mutation controls enabled for viewers.

### Bottom dock

- A single bottom-anchored container owns zoom, history, and one secondary-actions entry point.
- Find, Library, Arrange, Elements, Zen, and Help remain reachable through that entry point; preserve existing keyboard shortcuts. Do not permanently display five separate text actions above the dock.
- Primary top and bottom controls share height, radius, icon size, padding, selected treatment, and focus treatment. Shared styling does not mean duplicating the same actions in both places.
- Keep the dock within safe-area insets and the viewport. At narrow widths, use compact icon controls and a secondary menu rather than reducing hit targets or creating a second floating row.
- Read-only users retain zoom and non-mutating discovery actions; hide/disable mutation actions consistently.

### Panels and responsive behavior

| Context                            | Tools                                                         | Styles and secondary panels                                                    |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Phone, under 640px                 | Centered compact picker; wrapped palette on demand            | One non-modal bottom sheet at a time, above the dock; closed initially         |
| Tablet/compact desktop, 640–1199px | Centered picker or compact strip only if it demonstrably fits | One bounded drawer/sheet at a time; closed initially, including 1024px         |
| Wide desktop, 1200px and above     | Centered full tool strip, with side slots reserved            | Inspector near the right edge; other panels align with their dock trigger      |
| Short landscape viewport           | Same logical controls and actions                             | Reduced panel height with internal scrolling; header and dock remain reachable |

Desktop inspector width target: 256px, expandable only for content that genuinely needs it. Mobile sheet width follows the viewport with 8px outer gutters. Panel height follows available space between header and dock, capped around 420px on phones; it must shrink in short landscape views. Header/close controls stay visible while panel contents scroll.

### Density

Use the spacing scale instead of accumulated utility offsets. Toolbar inner padding is 4px; related control gaps are 4–8px; panel padding is 12px; panel section gaps are 12–16px. Page gutters are 16px on phones and 24px on larger screens. Reduce decorative whitespace, not canvas space or readable text.

Account forms stay centered horizontally with a sensible maximum width. Keep page scrolling, compact section spacing, clear heading hierarchy, and visible form errors. A short screen must be able to scroll to submit and mode-switch buttons.

## Elevation & Depth

Use a restrained border or soft offset shadow to separate controls from the drawing. Header and dock use the same elevation recipe. Do not stack a heavy shadow, strong border, and decorative blur on every control.

Maintain a documented layer order: canvas, editor chrome, panels/menus, then truly blocking dialogs. Portals may solve clipping but must respect that order. Development-only badges are not product navigation; distinguish them when reviewing screenshots.

Motion is limited to short panel/state transitions. Honor reduced motion. Opening or closing chrome must not reset the viewport or replay a drawing mutation.

## Shapes

Use the control radius for buttons and inputs, and the panel radius for grouped surfaces. Keep icon stroke weight consistent with the existing ToolIcon system. Do not replace controls with emoji or unrelated icon families.

**The Hit Area Rule.** Touch actions have at least a 44×44px interactive region even when the visible icon is 18–20px. Reduce surrounding padding and decorative containers to achieve density; never rely on a tiny icon-only hit area.

## Components

### Buttons and links styled as buttons

Use a shared primitive with primary, neutral, ghost, selected, and destructive variants. Align icon and label with inline-flex/grid centering, a defined minimum height, and consistent line height. Sign in must be vertically and horizontally centered inside its entire clickable surface in every state, including Account and My scenes.

Long labels/user names may truncate only where a full accessible label remains available. Account form submit labels must remain visible and must not truncate.

### Tool picker and toolbar

One tool definition list and selection state powers desktop and compact presentations. Maintain active state, keyboard navigation, accessible names, and tooltips where appropriate. Palette placement must leave navigation and account controls usable. Selecting a tool closes the compact palette without opening the style inspector automatically.

### Dock and secondary menu

One action registry supplies labels, icons, shortcuts, permissions, and handlers. The secondary menu names its features clearly. Zen has a clear exit affordance and retains its shortcut. Never remove existing functionality just to simplify the dock.

### Inspector and sheets

One panel controller coordinates tools, styles, search, library, arrangement, elements, and help. Only one compact secondary panel may occupy the workspace at a time. Escape closes the active panel; focus returns to its trigger. Opening one panel closes competing compact surfaces.

Sheets are non-modal unless the action requires protected focus. Controls inside a sheet must not start canvas gestures; external canvas gestures and committed history must continue to work correctly.

### Dashboard and authentication

Reuse shared controls and surface tokens. Keep readable forms, aligned actions, bounded content width, and compact spacing. Existing verification, error, loading, sign-in, signup, scene, and room behaviors remain intact.

## Do's and Don'ts

- Do preserve the current font and document-rendering behavior.
- Do check the entire top/bottom composition, rather than treating individual fixed controls independently.
- Do collapse compact panels by default and keep their close controls reachable.
- Do keep back/navigation and account slots clear of the tool picker.
- Do retain all Phase 19 features through menus or shortcuts.
- Do reuse semantic tokens and control primitives across editor and dashboard.
- Do not equate smaller visible chrome with smaller touch targets.
- Do not place Zen/Library/search actions in a permanently floating side strip.
- Do not introduce more media-query overrides to compensate for conflicting fixed positioning; replace the obsolete layout rules.
- Do not auto-center or move the user's drawing as part of a UI layout correction. Center the tool controls; preserve scene coordinates and viewport state.
- Do not describe planned rules as completed implementation. Verification belongs in the implementation summary.
