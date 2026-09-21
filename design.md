# UI/UX Design System & Guidelines — SecureClass

**Design Aesthetic:** Editorial Warm Modernism / Atelier Minimalist  
**Typography:** Plus Jakarta Sans & Newsreader (Serif Italic)  
**Primary Canvas:** `#DFDCD4` (Canvas Base), `#EFECE4` (Surface Cream), `#1F1E1B` (Deep Ink)

---

## 1. Design Philosophy & Aesthetic Pillars

SecureClass rejects generic corporate dashboard tropes (flat sterile blues, harsh neon borders, dense cluttered tables) in favor of a **calm, tactile, and editorial assessment environment**.

1. **Warm Visual Comfort:** Soft, organic cream tones (`#EFECE4`, `#F5F3EC`) reduce visual strain during long testing sessions.
2. **Tactile Micro-Interactions:** Subtle scale transitions, organic clay buttons, and glassmorphic floating pills create a tactile feeling of physical paper instruments.
3. **High Cognitive Clarity:** Clear hierarchy separating question prompt, selectable choices, navigation sidebars, and timer status.
4. **Resilient Non-Intrusive Feedback:** Unobtrusive toasts, auto-save status indicators, and gentle countdown warnings that preserve focus.

---

## 2. Color Palette & Token Hierarchy

```css
:root {
  /* Canvas & Surfaces */
  --color-canvas-bg: #DFDCD4;
  --color-surface-cream: #EFECE4;
  --color-surface-elevated: #F8F7F2;
  --color-border-subtle: rgba(31, 30, 27, 0.08);

  /* Typography & Ink */
  --color-ink-primary: #1F1E1B;
  --color-ink-muted: #686760;
  --color-ink-subtle: #96938B;

  /* Accent Signatures */
  --color-accent-coral: #DE6B48;     /* Primary brand signature */
  --color-accent-emerald: #10B981;   /* Correctness & connected status */
  --color-accent-amber: #F59E0B;     /* Warnings & unsaved changes */
  --color-accent-rose: #E11D48;      /* Integrity alerts & violations */
  --color-accent-slate: #2E4166;     /* Deep academic secondary */
}
```

---

## 3. Typography System

- **Display & Headings:** `Plus Jakarta Sans` (weights: 700, 800) with tight tracking (`-0.03em`) and high contrast.
- **Editorial Sub-headings & Taglines:** `Newsreader` italic serif for sophisticated academic accents.
- **Body & Controls:** `Plus Jakarta Sans` / `Inter` (weights: 400, 500, 600) for readability across screen resolutions.
- **Monospace Tokens:** `JetBrains Mono` / `Courier New` for exam session tokens, timers, and code blocks.

---

## 4. Component Standards

### 4.1 Tactile Buttons (`.btn-tactile`, `.btn-primary`)
- High-contrast deep ink background (`#1F1E1B`) on light surfaces.
- Soft pill radius (`999px` or `1rem`) with subtle drop shadow `0 10px 24px -6px rgba(31, 30, 27, 0.28)`.
- Interactive hover lifts (`transform: translateY(-2px)`) and click indentation (`transform: scale(0.98)`).

### 4.2 Glassmorphic HUD Indicators
- Frosted floating badges (`backdrop-filter: blur(12px)`, `background: rgba(255, 255, 255, 0.65)`).
- Used for timer displays, live participant counts, and question progress tracks.

### 4.3 Question & Answer Cards
- Uncluttered cards with clear active borders (`#1F1E1B` or `#DE6B48`) on selection.
- Option choices feature clear indicator pills (A, B, C, D) with distinct keyboard navigation shortcuts (1–4, A–D).

---

## 5. Page Layout Architecture

```
+-------------------------------------------------------------------+
| Top Navigation Bar (Brand, Global Search, Role Badge, Profile)    |
+-------------------------------------------------------------------+
|  Sidebar (Desktop)   |  Main Content Workspace                   |
|  - Dashboard         |  +---------------------------------------+ |
|  - Question Bank     |  | Page Header & Breadcrumbs             | |
|  - Exams             |  +---------------------------------------+ |
|  - Live Monitor      |  | Interactive Grid / Filter Toolbar     | |
|  - Results           |  +---------------------------------------+ |
|  - Settings          |  | Data Cards / Examination Flow / Stats  | |
+-------------------------------------------------------------------+
```

---

## 6. Accessibility & Motion Guidelines

- **Contrast Ratios:** Text against background meets minimum 4.5:1 ratio (AA standard).
- **Keyboard Navigation:** Full test traversal using `Tab`, `Arrow keys`, and numbers `1`–`4` for options.
- **Reduced Motion:** All transitions automatically reduce to 0ms when `prefers-reduced-motion` is detected.
- **Screen Reader Announcements:** Dynamic timer updates and error alerts use `aria-live="polite"` to avoid interrupting questions.
