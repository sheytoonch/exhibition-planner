# Exhibition planner: UX/UI audit and redesign plan

Date: 24 October 2026. Status: audit complete; first redesign implementation complete. See [implementation checkpoints](UI-REDESIGN-CHECKPOINT.md) for delivered scope, deliberate adjustments and validation. The findings below describe the pre-redesign baseline.

## Recommendation

Redesign the workspace structure before polishing individual controls. The current interface reflects separately implemented features: the image library, drawing tools, 3D controls and wall editor each introduce their own arrangement. The resulting inconsistency makes a capable application feel improvised.

Use one stable shell, one visual language and shared interaction rules. Keep the artwork and drawing surface dominant. Preserve the existing geometry and exhibition capabilities; simplify how people reach and operate them.

User clarification: maximizing the usable space around the main working object is a primary requirement. Large controls, panels and overlays covering that object are unacceptable. Workflows must be direct and intuitive. Evaluate every proposed control against the space it costs and the steps it saves.

This is a source-based expert review with an offline browser measurement of the drawing and 3D workspaces. It is not a user study or a complete accessibility conformance assessment. Wall and populated-library findings below come from source inspection and the supplied examples, not a newly measured browser walkthrough of those states.

## Evidence

Reviewed `index.html`, `style.css`, relevant view/library logic in `app.js`, and the recorded requirements and testing setup. The reproducible browser probe and raw results are in [ux-ui-audit/measure.cjs](ux-ui-audit/measure.cjs) and [ux-ui-audit/measurements.json](ux-ui-audit/measurements.json). It uses a fresh profile, a rectangle drawn through the UI, offline Edge, DOM measurements and no screenshots.

| View / viewport | Toolbar height | Workspace starts below top | Visible toolbar controls |
|---|---:|---:|---:|
| 2D, 1440 × 900 | 89 px | 186 px | 21 |
| 2D, 1280 × 800 | 169 px | 266 px | 21 |
| 2D, 1024 × 768 | 169 px | 266 px | 21 |
| 2D, 768 × 900 | 249 px | 346 px | 21 |
| 3D, 1440 × 900 | 88 px | 185 px | 14 |
| 3D, 1024 × 768 | 127 px | 224 px | 14 |

“Workspace starts” means the bottom of the toolbar and plan-tab stack, not the canvas element's bounds: the current canvas extends underneath interface chrome. Counts describe this particular state, not every available command. Six visible 2D toolbar controls and one 3D toolbar control have at least one dimension below 24 CSS px. This flags targets for investigation; spacing and equivalent-control exceptions must be checked before calling them WCAG failures.

## Findings, in priority order

| Priority | Finding and evidence | Proposed change |
|---|---|---|
| P1 | Navigation, creation commands, drawing tools, visibility settings and camera controls share `.plan-actions`; wrapping consumes substantial height. `index.html` plan toolbar; `style.css` rules around lines 1387 and 1441. | Separate navigation, tools and contextual settings. Use overflow for secondary commands rather than growing toolbar rows. |
| P1 | The wall editor replaces the plan toolbar and tabs with its own dense `.exhibition-toolbar`. Back, wall selection, naming, history and tools compete in another layout. | Keep the same shell when entering a wall. Change the canvas, breadcrumb and available tools, keeping their locations stable. |
| P1 | The sidebar puts selected-art properties before “Moje obrazy”; selecting artwork can push the source library farther down. `index.html` exhibition sidebar; `style.css` `.exhibition-sidebar`. | Give the right sidebar a stable structure. Keep the artwork list available and preserve its scroll position. Make detailed properties an explicit tab. |
| P1 | Library import state disables the entire plan view until every pending image is accepted. `app.js`, `refreshImageTabs`, around line 2850. | Validate each image when it is used. Pending metadata should not block drawing, existing placements or other complete images. Retain review as an image status/filter. |
| P1 | Similar operations have separate controls/forms in the plan, wall editor and library. The user's dimension inconsistency report is a concrete consequence. | Define shared control and interaction contracts first, then share their implementations where practical. Use one dimension presentation/editor pattern with context-specific geometry adapters. |
| P2 | Global button styling and numerous context overrides make many actions look equally prominent; green fills, cyan outlines and bespoke controls lack a clear hierarchy. `style.css` base button rules, CAD overrides and exhibition rules. | Neutral default buttons, one restrained accent, consistent selected/hover/focus states, and one primary action only when a decision needs it. |
| P2 | Wall naming is an always-visible input beside selection, while camera settings expose projection, axis, angle and step buttons together. | Rename from the wall title/menu. Put advanced camera settings in one popover; retain quick rotation steps near the orientation control. |
| P2 | Multiple bespoke menus, inspectors and floating forms create different interaction patterns for related tasks. | Standardize a small component family: toolbar, popover, inspector field, inline dimension editor and compact confirmation. |
| P2 | Small variant buttons and a 16 × 16 gizmo-home control warrant target and keyboard review. Tooltips alone do not establish a coherent keyboard workflow. | Consistent hit areas, visible keyboard focus, labelled controls and predictable menu dismissal. Check canvas-specific exceptions separately. |

These are product-design priorities, not claims that every current interaction is broken. Existing direct dimension editing, prepared-wall filtering, physical-size placement and persistent view state are valuable foundations to retain.

## Research and how it applies

- **Consistency:** NN/G recommends internal and external consistency. Here that means the same action should retain its name, appearance and location across drawing and wall work. It does not mean every context needs identical tools. [Consistency and standards](https://www.nngroup.com/articles/consistency-and-standards/).
- **Progressive disclosure:** keep frequently needed actions visible and expose specialised options on request. Apply it to arc variants, constraints, layers and detailed camera settings; avoid burying routine placement or distance editing. [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
- **Command hierarchy and overflow:** Microsoft's command-bar guidance distinguishes primary commands from secondary overflow commands and describes moving commands to overflow when space is limited. Apply the principle rather than introducing a Windows UI dependency. [Command bar](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/command-bar).
- **Target size:** WCAG 2.2 AA specifies 24 × 24 CSS px targets or applicable exceptions, including spacing. Use larger desktop toolbar hit areas where practical, and assess specialised canvas interactions individually. [Target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- **Alternatives to dragging:** retain click-to-place and numeric positioning alongside drag placement. Keyboard support is useful but does not by itself replace the single-pointer alternative required by this criterion. [Dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

The proposed shell and sizes below are design recommendations for this app, not layouts prescribed by these sources. No external service, framework or runtime dependency is required.

## Proposed interface

### A stable workspace

Use two main destinations: **Obrazy** and **Przestrzeń**. “Przestrzeń” is a proposed replacement for the current broad use of “Rzut”; a particular drawing can still be called a rzut. It better accommodates drawings, 3D and exhibition walls without pretending they are the same view.

Within Przestrzeń:

1. A compact top bar holds the current plan/wall breadcrumb, project navigation and history. A 2D/3D switch stays in the same place for plan views. In a wall, the breadcrumb provides the return path and wall switching.
2. A narrow left tool rail contains selection, drawing and measurement families. A tool's variants open in one consistent palette. Its settings appear in one reserved contextual row rather than scattered permanent controls.
3. The central canvas gets the remaining space. Direct dimension editing stays on the canvas. Zoom/fit controls occupy a stable viewport corner; 3D adds its orientation control there.
4. One compact, collapsible right sidebar uses **Obrazy / Właściwości** tabs. Show it when needed for artwork placement or explicit property inspection; do not reserve an empty sidebar in drawing/3D views. Obrazy is the default in wall work. Selecting an artwork highlights its source without automatically replacing or scrolling away the library. Detailed metadata lives in Właściwości; routine distances remain editable on the canvas. Dock the open sidebar outside the usable canvas rather than covering the working object. Preserve the user's collapse preference.

Treat the canvas as the primary layout region. Avoid stacked toolbars, oversized headers, permanent explanatory text and unsolicited floating inspectors. Use a compact workspace-focus toggle to hide optional chrome, with an obvious way back. Keep essential commands available without requiring hover discovery. Small contextual popovers should appear near the action without covering the selection or its edited dimension, and dismiss predictably. Opening or closing chrome must preserve world coordinates, zoom and selection; it must not silently reset the camera.

Keep common workflows direct: choose a prepared wall, choose an image, place it, then edit its distances on the canvas. Drawing follows choose tool, draw, edit dimension. Do not require a wizard, repeated confirmations or a properties-panel detour for these routine tasks. Reserve confirmation for meaningful transitions such as creating a hanging wall from selected faces, as already requested.

The plan/wall navigator opens from the breadcrumb instead of adding another permanent sidebar. It lists plans and only walls prepared for hanging or already containing artwork. Renaming is available at the selected wall's title/menu. Creating a wall remains a deliberate action after selecting one or more compatible faces, using a compact nearby confirmation.

At narrower widths, collapse optional panels and move secondary commands into overflow. Do not respond by creating three toolbar rows. Keep explicit controls to reopen panels; do not silently discard an in-progress edit. Target desktop/tablet workspace behaviour first; phone editing needs a separately validated interaction design.

### A small visual system

- Neutral application chrome and canvas backgrounds; artwork supplies most colour. One accent identifies active tools and selection. Status colours carry a defined meaning.
- Shared spacing scale of 4/8/12/16/24 px, a small type scale and consistent control borders/radii. Start with 32–36 px desktop control heights and verify usability and space in the prototype.
- One SVG icon style. Use short labels for unfamiliar actions and accessible names for icon buttons. Remove redundant prose rather than hiding useful labels indiscriminately.
- One form pattern with stable label/value alignment. Show units once at the relevant group or wall bounds, respecting the existing requirement to omit repeated `cm` inside wall dimensions.
- A single popover pattern, a single inspector pattern and consistent empty/loading/error states. Avoid routine success banners and instructional paragraphs occupying canvas space.

### Interaction and logic contracts

- Selection, navigation and editing are distinct. Clicking an object selects it; entering wall editing is explicit. Multi-face selection remains possible before wall creation.
- Escape cancels an unfinished gesture/input or exits the active tool. It must not remove previously committed extrusion or artwork. Undo reverses committed changes. Define this per operation rather than assuming all current live edits share one transaction boundary.
- Use the same dimension label, editing, annotation-dragging and cancellation behaviour in plans and walls. Geometry-specific constraints remain separate.
- Preserve accurate physical-size artwork previews and numeric distances to artwork, lines and wall edges. Do not introduce arbitrary-point wall measurements or abstract alignment menus as substitutes.
- Keep artwork globally unavailable after placement until removed from its wall. Show its location compactly and offer navigation to it; do not make disabled thumbnails unreadable.
- Pending image review becomes local to the asset. Missing physical size blocks placing that asset, with the missing field shown directly. Existing work remains accessible.
- Consolidate history controls visually first. Audit the current library/plan history boundaries before deciding whether a unified project history is safe; do not present separate histories as one global undo stack accidentally.
- Keep camera, active context, wall names, placements and annotation positions persistent. A layout redesign must preserve stored projects and recoverable editing state.

## Implementation checkpoints

Each checkpoint ends with a reviewable working state, its tests and a short completed-step count. No broad rewrite before the first working checkpoint.

| Step | Deliverable | Completion gate |
|---|---|---|
| 1 / 6 | Inventory actions and state transitions; define shared component tokens and interaction contracts; make a local static shell prototype. | Trace every existing command and user requirement to its proposed location. Review common task paths and 1280/1024/768 layouts before replacing live controls. |
| 2 / 6 | Introduce the shared shell and responsive navigation while preserving existing tool implementations. | Plan/wall switching, history controls, persistence and panel reopening work. No toolbar wrapping into multiple rows at the agreed desktop widths. |
| 3 / 6 | Consolidate drawing/wall tool families, contextual settings, numeric fields and dimension editing. | Equivalent operations follow the same contract. Existing geometry, constraint and dimension tests remain intact or receive intentional UI-selector updates. |
| 4 / 6 | Unify image library/sidebar and local asset validation. | Importing an incomplete asset does not block unrelated work. Physical sizes, global placement uniqueness, click/drag placement and stable library scrolling are verified. |
| 5 / 6 | Finish wall navigation, compact multi-face confirmation, camera controls and visual/accessibility consistency. | Coplanar unions preserve outlines/holes; only prepared walls are listed; keyboard focus, control hit areas, overflow and contrast receive numeric checks. |
| 6 / 6 | Run complete regression, persistence/migration checks and representative end-to-end workflows; document remaining product decisions. | All registered cases execute on the four-worker runner. New requirements have explicit coverage; missing/skipped cases do not count as success. Compare numeric workspace metrics with this baseline. |

Suggested implementation order is deliberate: shell first, then shared interactions, then workflow changes. The layout can therefore improve without simultaneously replacing the geometry engine or storage model.

## Verification and success criteria

Every changed behaviour and reported defect gets a unit or E2E case, with E2E exercising actual user interaction. Extend the existing requirement-to-test mapping; do not weaken old domain assertions to accommodate new selectors.

Measure DOM/SVG dimensions, positions, focus, visibility, rendered numeric values and canvas/GPU data offline. No screenshot comparisons, internet-dependent checks or AI assessment. Research is a design input, not a test dependency.

New checks should cover:

- Stable navigation/history positions across 2D, 3D and walls; predictable tab/focus order and menu dismissal.
- No unintended horizontal overflow, overlapping controls or inaccessible commands at the audited widths; fixed-height top chrome with secondary-command overflow.
- More usable central canvas than the current baseline, with no loss of common-command access. Aim for 80–96 px of total top chrome at 1280 × 800 in routine workflows; 120 px is a ceiling requiring justification, not the preferred layout. Measure the unobstructed canvas rectangle with optional panels open and closed, not just the canvas element's full size. Verify that panels/popovers do not obscure the selected object or dimension being edited.
- No additional mandatory steps in routine wall selection, image placement or distance editing. Compare task paths with the current UI, keep frequent actions directly available and avoid unnecessary confirmation dialogs. Verify that collapsing panels preserves selection, camera state and access to tools.
- Selecting artwork does not displace the library; switching tabs preserves its scroll. Drag preview matches declared physical size at the current zoom.
- Distances retain one decimal place; repeated inner `cm` labels do not return. Wall-bound labels retain units.
- Cancellation, undo/redo, reload, existing saved data, global image uniqueness, placeholder resizing and multi-face wall geometry retain their protected behaviour.

Complete representative workflows: import an image and set its size; create/extrude a plan; prepare a wall from multiple faces; place art and set distances; navigate to another prepared wall; reload and continue. Record interaction counts for the existing and proposed UI before claiming efficiency improvements. User review is still needed to assess whether the result feels clear and restrained; automated geometry checks cannot establish that preference.

The original audit was documentation-only and its browser probe completed successfully. Subsequent implementation and full regression results are recorded separately in [implementation checkpoints](UI-REDESIGN-CHECKPOINT.md).
