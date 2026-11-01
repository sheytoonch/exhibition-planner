# Workspace redesign checkpoints

## Plan and protected contracts — 1/6

The audit in UX-UI-AUDIT.md is the design baseline. Deliver six independently verifiable milestones:

1. Define action locations and interaction contracts (complete).
2. Compact shared shell: navigation, history, plan switching, restrained controls and workspace focus.
3. Consistent drawing/wall controls and inline dimension presentation.
4. Stable artwork sidebar and per-image validation instead of blocking project navigation.
5. Compact wall and camera controls, responsive access, keyboard focus and persistence.
6. Numeric layout checks and full four-worker regression.

## Action locations

| Action | Location |
|---|---|
| Library / space navigation, plan selection | Header |
| Undo / redo | Beginning of context command row |
| Drawing / selection / measurement | Compact context command row; existing variants remain attached to their tool |
| Wall selection | Existing prepared-wall selector; no raw-face catalogue |
| Wall naming | Compact wall details menu |
| Detailed camera settings | Camera menu; rotation steps remain directly accessible |
| Artwork sources / detailed properties | Stable right sidebar sections; source list does not move on selection |
| Frequent distance edits | Directly on canvas |
| Workspace focus | Header toggle; reversible without changing geometry or camera |

A compact command row is the first shell implementation rather than introducing a tool rail immediately: it preserves familiar tool locations and the drawing coordinate system while removing the large wrapped controls. Numeric viewport checks determine whether further redistribution is needed.

## Protected behaviour

- No geometry/storage-model rewrite. Existing saved data remains usable.
- Exit a tool without undoing committed extrusion; undo reverses committed edits.
- Physical-size placement, globally unique source artwork, editable placeholders.
- Prepared walls only; compatible multi-face unions retain holes and boundaries.
- One decimal in wall dimensions; units on wall bounds rather than every inner label.
- Existing measurement anchors and annotation movement remain intact.
- Keep offline numeric testing and complete test-case accounting.

## Verification gates

Add real UI tests before changing reported behaviours. Measure top chrome, overflow and control availability at 1440, 1280, 1024 and 768 px. Check panel collapse, focus mode, state persistence and pending-import navigation through UI events. Keep the existing domain regression assertions. Run affected suites during development and the complete suite on the final version.

## Shared shell — 2/6

Implemented a 44 px header with plan switching, a 56 px single-row command bar, shared neutral/active/focus tokens and a reversible workspace-focus control. Tool variants now have 24 px wide hit targets. At all four target widths the new browser case verifies command access, top chrome at most 120 px, no document overflow and unchanged geometry after toggling focus. The case first failed on the previous layout, then passed after implementation. The canvas coordinate system is unchanged.

## Shared controls — 3/6

Drawing, wall, camera and library contexts now share neutral controls, selected states and visible focus styling. Menus and numeric fields share their styling; measurement geometry and existing dimension precision remain unchanged. Wall navigation moved to the header; wall naming and detailed camera settings moved to compact popovers. Existing exhibition tests use the new menu entry points while retaining their domain assertions.

## Artwork workflow — 4/6

The artwork source heading/list stays above a separately scrolling properties section. This keeps direct properties available without a mandatory tab switch; it replaces the originally proposed tabs to reduce steps. A regression first reproduced selection pushing the source heading from y=113 to y=492, then verified a stable heading. Sidebar collapse returns its width to the wall and is remembered. The library retains its own scroll offset during rendering. Pending imports no longer disable space navigation; asset acceptance/physical-size requirements still control placement.

## Wall/camera refinement — 5/6

Wall tools fit a compact horizontal row and the wall stage fills the remaining height. Prepared-wall switching and multi-face confirmation retain existing behaviour. Camera projection/rotation-axis settings are grouped; quick 45-degree steps remain visible. Keyboard tests caught and fixed Escape reaching the model tool before dismissing new menus; dismissal now restores focus and preserves selection. Focus-mode tests verify geometry, angle and zoom are unchanged.

## Final verification — 6/6

Complete four-worker regression passed on the final application/test version: 272 cases, including 55 unit and 217 E2E. Worker work times: 67.8 / 67.9 / 68.5 / 67.8 seconds; total work 272.0 seconds. Full report: `tests/test-runs/run-AHKJ36/summary.json`.

The new E2E cases cover compact tools at four widths; reversible focus mode without geometry/camera changes; wall canvas space at three widths; stable artwork heading on selection; persistent panel collapse and wall naming; keyboard menu access/dismissal/focus; and navigation/reload while an import remains unfinished. Existing domain tests retain their assertions. The image-import test now waits for image-save completion rather than using the removed navigation lock as an unrelated readiness signal.

At 1280 × 800, top chrome fell from approximately 266 px to 100 px in 2D, returning about 166 px of vertical working space. Wall navigation/tool chrome uses 88 px. Source and properties remain simultaneously available in separate scrolling regions rather than requiring a tab switch. Narrow command rows scroll horizontally instead of wrapping; further prioritisation into overflow can be considered after real workflow feedback.

This completes the first redesign implementation. The original audit includes longer-term options, including a dedicated tool rail and deeper history/dimension-controller consolidation. This delivery intentionally preserves the existing geometry, history boundaries and dimension model while standardising their interface. No automated test establishes subjective usability or guarantees the absence of every possible defect.
