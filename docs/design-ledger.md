# Character UI Design Ledger

## Accepted Direction

The implemented interface follows the user's chosen hybrid: **the layout of concept 1, the style of concept 3, and the details of concept 2**.

Source references are preserved in [`design-concepts/`](../design-concepts/):

- [`01-split-workbench.png`](../design-concepts/01-split-workbench.png)
- [`02-dark-focus-console.png`](../design-concepts/02-dark-focus-console.png)
- [`03-editorial-trait-library.png`](../design-concepts/03-editorial-trait-library.png)

## Concept-to-Implementation Map

| Accepted source   | Implemented characteristic                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concept 1 layout  | Persistent profile/navigation rail, central searchable checklist workspace, and a simultaneous right-side instruction preview.                                                                     |
| Concept 3 style   | Warm paper surfaces, restrained terracotta accent, editorial serif headings, fine rules, generous whitespace, and low-chrome controls.                                                             |
| Concept 2 details | Dense monospaced compiled output, live compiler state, trait/character/hash metadata, exact instruction inspection, provenance, trust, license, pin/archive controls, and explicit export actions. |

## Intentional Corrections

The three source concepts were layout moodboards with generated or unreadable microcopy. The implementation intentionally replaces that content with deterministic trait data and real controls. It also changes the following where fidelity would have harmed usability:

- Text and interactive colors meet WCAG AA contrast in the tested primary builder.
- Native checkboxes remain the accessible interaction target while receiving the custom visual treatment.
- Horizontal category and navigation rails are contained scroll regions on narrow screens; the three desktop panes stack into one readable mobile flow.
- Export is always an action, never styled as a selectable trait.
- The compiled instruction panel is keyboard-focusable and scrollable.
- Every icon action has an accessible name, and imported files remain inert validated data.

## Fidelity Evidence

The production build was captured at a 1440 by 900 desktop viewport and a Pixel 7 mobile viewport, then visually compared with all three accepted source concepts in the same review pass. The desktop result preserves the chosen split-workbench silhouette while making the dark detail console materially denser than the center checklist. The mobile result retains the editorial hierarchy and stacks the compiled detail console after the complete trait workspace without document-level horizontal overflow.

Automated browser coverage validates both viewports for core interactions, `.charui` export, serious/critical accessibility findings, and horizontal overflow.
