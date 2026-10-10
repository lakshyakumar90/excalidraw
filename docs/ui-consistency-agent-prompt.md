# UI consistency implementation handoff

Use this prompt when implementation is explicitly requested:

> Implement the compact UI refinement in docs/ui-consistency-implementation-plan.md, following the root DESIGN.md. Keep Geist Mono and all editor/account/collaboration behavior. Build a header with reserved navigation/account slots and centered tools, one anchored bottom dock, discoverable secondary actions, and coordinated compact sheets/inspectors. Fix centered button labels and reduce decorative spacing. Split large files along the documented boundaries without changing data ownership, permissions, history, or sync semantics. Inspect the stated phone/tablet/1024px/desktop matrix using browser/computer tools. Use one verification pass, a correction batch, and at most one confirmation round; add tests only for concrete behavior risks. Make small logical commits, update relevant READMEs, and report only checks actually completed. Follow the implementation run's explicit instructions about pushing, merging, and starting services. Preserve existing data and secrets, and never reset a drawing to make the UI look centered.

References:

- [Design system](../DESIGN.md)
- [Implementation sequence and acceptance criteria](./ui-consistency-implementation-plan.md)
- [Project setup and package ownership](../README.md)
- [Previous responsive update and testing limits](./responsive-maintainability-summary.md)
