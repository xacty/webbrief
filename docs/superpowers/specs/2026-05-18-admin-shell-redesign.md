# WeBrief Admin Shell — Redesign Spec

**Date:** 2026-05-18
**Scope:** Admin shell (sidebar + all admin pages). Editor excluded.
**Status:** Approved for planning

---

## 1. Design Direction

### Visual personality
Modern SaaS — clean, spacious, content-forward. Comparable to Linear, Vercel dashboard, or Stripe. Not flashy; every visual element earns its place.

### Light / Dark
- **Default:** Light mode (white/slate base)
- **Toggle:** User-controlled dark mode switch in the sidebar footer or top bar
- **Dark style:** Dark & Premium — near-black surfaces (`#111113`), high contrast, same blue accent

### Non-negotiables
- Logo stays **black** in both modes
- Body typography stays **black/near-black** (`#0f172a` light, `#f5f5f7` dark)
- Accent color applies **only** to interactive elements: buttons, links, active states, badges, hovers
- All existing functionality is preserved (multiselect, kebab menus, bulk actions, archive/delete, etc.)

---

## 2. Color System

### Primary accent
**Royal Blue** — `#2563eb` (Tailwind `blue-600`)

Full scale used across the app:

| Token | Value | Usage |
|---|---|---|
| `--wb-color-primary-50` | `#eff6ff` | Tinted backgrounds (active nav, badges) |
| `--wb-color-primary-100` | `#dbeafe` | Hover fills, card borders on hover |
| `--wb-color-primary-500` | `#3b82f6` | Focus rings |
| `--wb-color-primary-600` | `#2563eb` | **Main accent** — buttons, links, active states |
| `--wb-color-primary-700` | `#1d4ed8` | Button hover, dark text links |
| `--wb-color-primary-800` | `#1e40af` | Pressed states |
| `--wb-color-primary-900` | `#1e3a8a` | Dark mode accent tints |

> The existing token names (`--wb-color-primary-*`) stay the same — only the values change from the current indigo to royal blue. Zero callsite changes needed.

### Neutral base
Slate scale (`#f8fafc` → `#0f172a`) replaces the current neutral-gray. Slightly cooler, pairs naturally with the blue accent.

### Shadow system — elevated tinted cards
Cards use a two-layer shadow with a blue tint:
```css
box-shadow:
  0 4px 16px rgba(37, 99, 235, 0.10),
  0 1px 3px rgba(0, 0, 0, 0.04);
```
Hover state intensifies:
```css
box-shadow:
  0 8px 24px rgba(37, 99, 235, 0.14),
  0 2px 6px rgba(0, 0, 0, 0.06);
```

---

## 3. Typography

No font change — keeps `system-ui / -apple-system` stack. The improvement comes from tightening the scale and weight usage:

| Role | Size | Weight | Color |
|---|---|---|---|
| Page title | `--wb-text-2xl` | 800 | `--wb-text` |
| Section title | `--wb-text-xl` | 700 | `--wb-text` |
| Card title | `--wb-text-sm` | 700 | `--wb-text` |
| Body / meta | `--wb-text-sm` | 400–500 | `--wb-text-muted` |
| Labels / chips | `--wb-text-xs` | 600–700 | accent or muted |

Letter spacing: `-0.5px` on titles 2xl+. All color-accented text (links, active nav, chips) uses primary tokens, not hardcoded values.

---

## 4. Sidebar

### Structure
```
[Logo — black, bold]
─────────────────
Principal
  Empresas       ← nav-item (icon + label)
  Usuarios
─────────────────
Admin
  Seguridad
  Archivados
  Papelera
─────────────────
[Avatar] [Name]  ← bottom, with dark mode toggle
[Role]
```

### Styling
- **Background:** `white` (light) / `#111113` (dark)
- **Border:** `1px solid var(--wb-border)` on the right edge
- **Width:** `200px` (current stays)
- **Active item:** `background: var(--wb-color-primary-50); color: var(--wb-color-primary-700); font-weight: 600`
- **Inactive item:** `color: var(--wb-text-muted)`
- **Hover:** `background: var(--wb-surface-muted)`
- **Section labels:** `font-size: --wb-text-xs; font-weight: 700; color: --wb-text-subtle; text-transform: uppercase; letter-spacing: 0.8px`
- **Icons:** 16px, stroke-based (Lucide, already in use)

### Dark mode toggle placement
Icon button in the sidebar footer, next to the user avatar. Toggles a `data-theme="dark"` attribute on `<html>`.

---

## 5. Card System

All cards (companies, projects) use the same elevated style:

```css
.card {
  background: var(--wb-surface);          /* white / #1c1c1e */
  border: 1px solid var(--wb-border-card); /* #e8edfb / #2a2a2e */
  border-radius: var(--wb-radius-md);     /* 10px */
  box-shadow: 0 4px 16px rgba(37,99,235,0.10), 0 1px 3px rgba(0,0,0,0.04);
  transition: box-shadow 150ms ease, border-color 150ms ease;
}
.card:hover {
  box-shadow: 0 8px 24px rgba(37,99,235,0.14), 0 2px 6px rgba(0,0,0,0.06);
  border-color: var(--wb-color-primary-100);
}
```

Type chips (Brief, Artículo, FAQs, Página Web) use:
```css
background: var(--wb-color-primary-50);
color: var(--wb-color-primary-700);
border-radius: var(--wb-radius-full);
font-size: var(--wb-text-xs);
font-weight: 700;
```

---

## 6. Pages

### 6.1 Companies list (`/companies`)

**Layout:** Page title + subtitle + "Nueva empresa" CTA → responsive grid of company cards.

**Company card anatomy:**
```
[Company name — bold]
[N proyectos · N miembros — muted]
─────────────────────────
[Chip: N proyectos]    [hace X — muted]
```

Card is clickable (navigates to company detail). Existing kebab menu (edit, archive, delete) preserved on the card.

**Grid:** 3 columns on desktop, 2 on tablet, 1 on mobile (existing breakpoints).

---

### 6.2 Company detail (`/companies/:id`) — TAB LAYOUT

Replaces the current 2-column layout (projects + team sidebar) with a tab-based single-column layout.

**Header (sticky):**
```
[Breadcrumb: Empresas / Nombre empresa]
[Company name — h1]          [+ Proyecto]
─────────────────────────────────────────
[Proyectos] [Equipo] [Actividad]   ← tabs
```

Tab underline uses `border-bottom: 2px solid var(--wb-color-primary-600)` for active.

**Tab: Proyectos**
- Full-width 3-column project grid (same card style as above)
- Bulk select toolbar preserved (appears when selecting cards)
- Empty state preserved

**Tab: Equipo**
- Invite form (labels already added in commits 1–7)
- Members list
- All existing RBAC logic preserved

**Tab: Actividad**
- New tab — shows recent activity across all projects in the company
- Requires new backend endpoint: `GET /api/companies/:id/activity`
  - Queries `project_activity` filtered by `project_id IN (projects of this company)`
  - Returns last 50 events ordered by `created_at DESC`
  - Reuses existing `requireAuth` + company membership check
- List of events: project created/edited/archived, member joined, share link created
- Simple chronological list; no pagination needed for v1

---

### 6.3 Users page (`/users`)

**Layout:** Page title + search/filter row → table or list of users.
- Same card elevation and border style
- Row hover: `background: var(--wb-surface-muted)`
- Active/blocked badges use existing `--wb-success` / `--wb-danger` tokens

---

### 6.4 Security, Archive, Trash

These pages get the updated tokens (colors, shadows, card style) automatically since they use the shared primitives. No layout changes needed.

---

## 7. Dark Mode

Implemented via CSS custom property overrides on `[data-theme="dark"]` at the root:

```css
[data-theme="dark"] {
  --wb-bg: #0d0d10;
  --wb-surface: #1c1c1e;
  --wb-surface-muted: #111113;
  --wb-border: #1e1e22;
  --wb-border-card: #2a2a2e;
  --wb-text: #f5f5f7;
  --wb-text-muted: #555;
  --wb-text-subtle: #333;
  /* Primary accent stays the same — slightly lighter for contrast */
  --wb-color-primary-50: #1a2a4a;
  --wb-color-primary-600: #3b82f6;  /* blue-500 — brighter on dark bg */
  --wb-color-primary-700: #60a5fa;  /* blue-400 — for text on dark */
}
```

Toggle persists to `localStorage` and applies before paint (no flash).

**Dark mode shadows:** The blue tint in the card shadow is removed in dark mode — on near-black backgrounds it muddles. Dark mode cards use a neutral shadow:
```css
[data-theme="dark"] {
  --wb-shadow-card: 0 4px 16px rgba(0, 0, 0, 0.30), 0 1px 3px rgba(0, 0, 0, 0.20);
  --wb-shadow-card-hover: 0 8px 24px rgba(0, 0, 0, 0.40), 0 2px 6px rgba(0, 0, 0, 0.24);
}
```

---

## 8. Preserved Functionality

The redesign is **purely visual**. The following stay exactly as implemented:

- Multiselect (checkbox + bulk toolbar) on project cards
- Kebab menus on company and project cards (edit, archive, trash, move)
- Invite form with role selector and feedback messages
- Member edit modal
- RBAC visibility rules (canInvite, canManageMember, etc.)
- Session cache (stale-while-revalidate)
- All existing routes and navigation

---

## 9. Implementation Approach

### Phase order
1. **Token update** — update `--wb-color-primary-*` values and add dark mode variables to `tokens.css`
2. **Shadow tokens** — add `--wb-shadow-card` and `--wb-shadow-card-hover` with tinted values
3. **Sidebar** — new section labels, active state, dark mode toggle button
4. **Card components** — apply new shadow/border to Card primitive; update Button, Badge, Input to use updated tokens
5. **Companies list page** — apply card system, update grid layout
6. **CompanyPage** — migrate to tab layout (Proyectos / Equipo / Actividad); Actividad tab is new
7. **Dark mode** — wire toggle, persist to localStorage, test all pages
8. **Other admin pages** — Users, Security, Archive, Trash get tokens automatically; verify visually

### No breaking changes
All token names stay the same. The changes are to token *values* and the addition of new tokens. Existing CSS that uses `var(--wb-color-primary-*)` automatically picks up the new blue.

---

## 10. Out of Scope

- Project editor (TipTap) — separate milestone
- Login / reset password pages
- Public share pages (`/share/:token`)
- New features beyond the Actividad tab (which needs one small backend endpoint)
