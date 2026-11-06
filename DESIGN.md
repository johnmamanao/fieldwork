# Fieldwork — design record

Read this before changing any screen. All values live in `web/src/styles.css` as tokens; components use the tokens and never typed values.

## v2 — realigned to the maydin.co reference (2026-11-05)

The owner supplied a reference screen (a "Reports" table in a light, pill-driven dashboard) and asked for the dashboard and cards to match it. Their reference outranks the house rules below where they conflict. These v2 values replace the v1 type, palette and rules that follow.

- **Canvas and cards.** The canvas is `#F4F4F5` and the sidebar `#FAFAFA` (hairline right edge). Cards are white, radius 16, with a 1px ring plus a soft shadow (`--shadow-ring`) instead of a border.
- **Type.** Inter 400–700. Page titles are 34px bold, tracked −0.035em. KPI figures are 32px bold. Table headers and sidebar group labels are 12px uppercase, tracked 0.06em, as in the reference. Invoice and project IDs are set in JetBrains Mono 11px under the title.
- **Accent.** One orange-red, `#F0512A` (strong `#D9431F`). It is used for count badges, "Clear all", the logo mark, progress toward a limit, the focus ring and the current chart series. The chart pair `#D9431F` / `#4F7DB8` passes every dataviz validator check (CVD ΔE 21.4, normal-vision ΔE 28.0, 3:1 contrast).
- **Controls.** Segmented tabs carry count pills; the active tab is a white chip with a dark count. Toolbar pills (date range, sort, filters with an accent count) sit beside a full-width search bar with a `/` shortcut. Removable filter chips are followed by a dashed "+ Add filter" chip and the "Clear all" link.
- **Status.** A neutral-tinted pill with a coloured dot and a word (paid green, pending amber, overdue red, in progress blue). Status is never shown by colour alone.
- **Tables.** A checkbox column, the title with a mono ID beneath it, a round org mark (dark, outlined or accent) for clients, neutral tag pills for projects, bold right-aligned amounts, a row menu, and "Rows per page" with a dark active page in the footer.
- **Shell.** The workspace block (round dark logo, bold name, role and currency) opens the switcher. The active nav item is a grey pill with a semibold label. Settings and the user card sit at the bottom. The header holds a breadcrumb pill on the left and pill actions on the right.

## Brand guidelines (v1, superseded where v2 differs)

**Idea: the studio ledger.** Every figure is rebuilt from approved records and links back to them. The canvas is cool paper-grey; panels sit flat on it with hairline rules; colour appears only where money or time moves.

**Claim and proof.** The claim is "approved time becomes an invoice once, and a payment closes it." The proof is that every KPI tile carries a *source line*: one quiet sentence stating the definition, with a link to the rows behind it (for example, Analytics → Reports with the same filters, where the totals match).

**Type.** Inter (Google Fonts) at 400, 500 and 600 only, tracked −0.011em for body and −0.022em for headings, with tabular figures wherever numbers align. Steps: 32 / 24 / 18 / 15 / 14, plus 28 for KPI figures. Body text is 15px. Labels and secondary text are 14px. There are no uppercase letter-spaced labels and no weights of 700 or above.

**Palette** (OKLCH in the tokens; hex values approximate):

| Role | Value | Use |
|---|---|---|
| Canvas | `#F3F4F6` · oklch(0.968 0.004 250) | Page background |
| Surface | `#FFFFFF` | Panels, tables, dialogs |
| Sunken | `#ECEEF1` | Bands, segmented-control tracks, board columns |
| Ink | `#17181B` · oklch(0.21 0.008 265) | Text, primary buttons, the active-tab bar |
| Secondary text | `#5B606B` | Meta lines (passes 4.5:1 on surface) |
| Hairline | `#E1E4E8` | Borders and row rules |
| Ochre (accent) | oklch(0.55 0.13 55) | Active nav icon, focus ring, unread counts |
| Series — current | `#BF7228` | Current-period line and sparklines |
| Series — comparison | `#4F7DB8` dashed | Previous-period line |
| Status | green / amber / red / blue subtle chips | Always paired with a text label |

The two chart series pass the dataviz validator: lightness band, chroma floor, CVD ΔE 20.4 (protan), normal-vision ΔE 23.5, and 3:1 contrast. The comparison series is also dashed, so it never relies on colour alone.

**Imagery.** None inside the working app. The desdivj references' floral and iridescent backdrops belong to presentation shots (spec §21), so they are not used here.

**Owned detail.** The source line under every figure, and the ledger rows on the sign-in panel that state each record's lifecycle.

**Motion.** 120ms colour and press feedback; 180ms dialog and popover rise (opacity plus 4px); no motion on data. A draw-in animation on the chart was removed because it stayed frozen when the page was backgrounded. `prefers-reduced-motion` reduces everything to an instant change.

**Rules**
1. One filled ink button per view: the primary action. Everything else is an outline or ghost button.
2. A figure without a definition or a link to its rows does not ship.
3. Ochre marks selection and the current period only. It never marks a status.
4. A status chip always has a word in it. Dots appear only for live, unread or presence states (`data-seenry-dot`).
5. Radii: 6px for chips, 8px for controls, 14px for panels, full for avatars and counts. Corners stay at or under 25% of the control's height.

## Tokens

| Group | Tokens |
|---|---|
| Space | 4, 8, 12, 16, 24, 32, 48, 64 (`--space-1` … `--space-8`) |
| Radius | `--radius-xs` 4, `--radius-sm` 6, `--radius-md` 8, `--radius-lg` 14, `--radius-full` |
| Controls | 28 (sm), 36 (default), 40 (primary) |
| Motion | `--dur-1` 120ms, `--dur-2` 180ms, `--dur-3` 240ms, `--ease-out`, `--ease-in-out` |
| Elevation | flat panels with a hairline; `--shadow-raised` for the active nav and segmented thumb; `--shadow-overlay` for menus and dialogs |

## Shell

A grouped left sidebar (Workspace, Business, Finance, People, Account, Administration) with a workspace switcher showing the current role. Navigation items are filtered by permission. On screens 960px wide or narrower the sidebar becomes a drawer. A sticky translucent top bar holds the running timer (or a start button), notifications with an unread count, and the account menu.

## Components

- **KPI tile:** label (secondary, 500), figure (28/600 tabular, unit at 15/500), delta against the comparison period (an absolute change when the prior value was zero), then the source line.
- **Table:** 14–15px rows with hairline rules, a whole-row link with a hover tint, right-aligned tabular numbers, and a total in `tfoot`.
- **Comparison chart:** one y-axis, running totals, ochre current line over a dashed blue comparison line, a crosshair tooltip (hover, focus, arrow keys), a legend and a table toggle with identical numbers. Future buckets are not drawn.
- **Empty state:** a tinted icon, a plain headline naming the condition, one sentence on purpose, one primary action, and one line of guidance.
- **Dialogs:** title and subtitle state the consequence ("Its number stays used, its time is released"). Finance and approval actions wait for the server before closing.

## References and research

Seenry MCP `research_design_brief` (apps: analytics dashboard, time tracking, invoices), 2026-11-05:

- **TravelSpend, Analytics Dashboard** — used in part: restraint, large tabular figures with small units, two data colours on a warm-neutral canvas.
- **Invoice Maker, Invoices Empty State** — used in part: empty state built from an icon, one sentence and one dark action.
- **Joist, Invoices List** — used in part: amount with a status chip beneath it. Its promo card and green brand were rejected.
- **Hours Tracker store art; Quranly and fasting screens** — rejected (marketing or task mismatch).
- `search_sections "dashboard"` (Datadog, Sentry, Basedash, Easlo) returned candidates, but the library was unavailable for pixel inspection, so they were not used.

User-supplied desdivj references (`work/references`):

- **cadre.png** — the layout bar: grouped sidebar, ink primary button, stats strip, tabs with counts.
- **dark.png** — row density and the person hover card.
- **pairy.png** — warm data colour on neutral UI.
- **card.png, art.png** — presentation only.

**Rejected directions:** a dark charcoal shell (reads as a monitoring tool, not a studio ledger), and an editorial serif display face (the screens are utility screens that need scan speed; the desdivj note says utility screens need not use serif).

The attribution is inspiration only. This is not Divan Raj's design system and implies no endorsement.
