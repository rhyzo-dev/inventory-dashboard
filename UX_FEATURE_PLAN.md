# Inventory Dashboard — UX Feature Plan

**Goal:** Complete UX feature set in one implementation pass. Prioritized by impact vs effort.

---

## 🎯 Phase 1: Core Viewing Experience (Must Have)

### 1.1 Image Lightbox
- **What:** Click thumbnail → modal overlay with full-size image, dark backdrop, Esc/click-outside to close
- **Why:** Keep context, faster than new tab, mobile-friendly
- **Effort:** Low (new `ImageLightbox.tsx` + 10 lines in `InventoryTable.tsx`)

### 1.2 Thumbnail in Table
- **What:** 50×50px preview in Image column (currently text "View" link)
- **Why:** Visual scanning, identify items instantly
- **Effort:** Low (replace `<a>` with `<img>` + click handler)

### 1.3 Sortable Columns
- **What:** Click column headers to sort (Name, SKU, Category, Qty, Min Qty, Cost, Expiry, Updated)
- **Why:** Essential for data exploration
- **Effort:** Medium (UI indicators + API `sort`/`order` params + backend query)

### 1.4 Row Hover + Keyboard Navigation
- **What:** Highlight row on hover; ↑/↓ keys navigate, Enter opens details
- **Why:** Power users, accessibility
- **Effort:** Low (CSS + `onKeyDown`)

---

## 🎯 Phase 2: Data Density & Scanning (High Impact)

### 2.1 Density Toggle
- **What:** Compact / Comfortable / Spacious row height toggle (persisted in localStorage)
- **Why:** Different user preferences, more rows on screen
- **Effort:** Low (CSS classes + localStorage)

### 2.2 Column Visibility (Show/Hide)
- **What:** "Columns" dropdown → checkboxes to toggle columns (SKU, Category, Bin, Expiry, Image, Updated, Actions)
- **Why:** Reduce clutter, focus on relevant data
- **Effort:** Medium (state + persistence + responsive)

### 2.3 Sticky Header + First Column
- **What:** Table header stays on scroll; SKU/Name column sticky left
- **Why:** Context when scrolling large datasets
- **Effort:** Low (CSS `position: sticky`)

### 2.4 Virtual Scrolling (Large Datasets)
- **What:** Render only visible rows (react-window or tanstack-virtual)
- **Why:** Performance at 100+ rows/page
- **Effort:** Medium (new dependency, but significant perf gain)

---

## 🎯 Phase 3: Filtering & Discovery (High Impact)

### 3.1 Multi-Select Filters
- **What:** Category/Status/View support multiple selections (chips + dropdown)
- **Why:** "Show Electronics AND Tools" not just one
- **Effort:** Medium (UI + API `IN` clause)

### 3.2 Saved Filter Presets
- **What:** "Save current filters as preset" → dropdown to load (localStorage)
- **Why:** Recurring views (e.g., "My low stock items")
- **Effort:** Low (localStorage + UI)

### 3.3 Quick Filter Chips
- **What:** Clickable chips above table: "Low Stock (23)" "Out of Stock (5)" "Expiring (12)" — one-click filter
- **Why:** Faster than dropdown, shows counts
- **Effort:** Low (uses existing stats API)

### 3.4 Advanced Search Syntax
- **What:** Support `sku:DRL-001`, `category:tools`, `qty:<10`, `expiry:<30d`
- **Why:** Power users, precise queries
- **Effort:** Medium (parser + API integration)

---

## 🎯 Phase 4: Item Detail & Actions (Medium Impact)

### 4.1 Row Click → Slide-Out Detail Panel
- **What:** Click row → right slide panel with full item details, larger image, history
- **Why:** Drill-down without losing table context
- **Effort:** Medium (new `ItemDetailPanel.tsx` + state)

### 4.2 Copy to Clipboard
- **What:** Click any cell → copies value (toast confirmation); "Copy row" action
- **Why:** Common workflow: paste into emails, spreadsheets
- **Effort:** Low (Clipboard API + toast)

### 4.3 QR/Barcode Display
- **What:** In detail panel, show SKU as QR code + barcode (for scanning)
- **Why:** Warehouse workflow integration
- **Effort:** Low (qrcode.react + barcode library)

### 4.4 Stock Level Indicator
- **What:** Visual bar in Qty column: `████████░░ 42/100` (progress toward max_threshold)
- **Why:** At-a-glance capacity awareness
- **Effort:** Low (CSS bar component)

---

## 🎯 Phase 5: Export & Sharing (Medium Impact)

### 5.1 Export Formats
- **What:** CSV (current), Excel (.xlsx), PDF report
- **Why:** Different stakeholder needs
- **Effort:** Medium (exceljs + pdfkit in Functions)
- **Excel columns:** Item Code (SKU), Item Name, **Specification**, Location, Manufacturing Date, Expiration Date, Current Quantity

### 5.2 Export Options Modal
- **What:** Click Export → modal: choose format, columns, date range, include images?
- **Why:** Flexibility vs single CSV
- **Effort:** Medium (modal + API params)

### 5.3 Shareable Filter URL
- **What:** URL encodes all filters: `/?search=drill&category=tools&status=low_stock&page=1&limit=50`
- **Why:** Share views with colleagues, bookmark
- **Effort:** Low (URLSearchParams sync with state)

### 5.4 Scheduled Email Reports (Future)
- **What:** "Email me low stock report daily"
- **Why:** Proactive alerts
- **Effort:** High (needs backend worker, auth, email service)

---

## 🎯 Phase 6: Mobile & Accessibility (Must Have)

### 6.1 Mobile Card Layout (Already Done)
- **Status:** ✅ Implemented in `InventoryTable.tsx`

### 6.2 Touch-Optimized Controls
- **What:** Larger tap targets (44px min), swipe actions on rows
- **Why:** Tablet/phone usage in warehouse
- **Effort:** Low (CSS + touch handlers)

### 6.3 Full Keyboard Support
- **What:** Tab order, arrow keys, Enter/Space, Esc, shortcuts (/, r, e)
- **Why:** Accessibility + power users
- **Effort:** Medium (focus management + shortcuts)

### 6.4 Screen Reader Support
- **What:** ARIA labels, live regions for loading/results, table semantics
- **Why:** WCAG compliance
- **Effort:** Medium (audit + fixes)

---

## 🎯 Phase 7: Visual Polish (Nice to Have)

### 7.1 Dark Mode Toggle
- **What:** Light/Dark/System toggle (persisted)
- **Why:** Warehouse lighting conditions vary
- **Effort:** Low (Tailwind `dark:` + localStorage)

### 7.2 Empty State Illustrations
- **What:** Friendly illustrations for: no results, no data, error, offline
- **Why:** Better than "No items found" text
- **Effort:** Low (SVG + component)

### 7.3 Loading Skeletons
- **What:** Shimmer placeholders while fetching (instead of spinner)
- **Why:** Perceived performance
- **Effort:** Low (CSS animation + component)

### 7.4 Tooltips & Help
- **What:** Hover tooltips on column headers, filter chips; "?" help icon
- **Why:** Self-documenting UI
- **Effort:** Low (tooltip component)

---

## 📋 Recommended Implementation Order

| Sprint | Features | Est. Time |
|--------|----------|-----------|
| **1** | 1.1, 1.2, 1.3, 1.4, 6.3 | 2-3 hrs |
| **2** | 2.1, 2.2, 2.3, 3.1, 3.3 | 2-3 hrs |
| **3** | 4.1, 4.2, 4.3, 4.4, 5.3 | 2-3 hrs |
| **4** | 5.1, 5.2, 6.1, 6.2, 6.4, 7.1-7.4 | 2-3 hrs |

**Total: ~8-12 hours for complete UX overhaul**

---

## 🗣️ Decision Needed

**Which phases to include in this revision?**

- [ ] **Phase 1 only** (Core viewing: lightbox, thumbnails, sort, keyboard) — *Recommended minimum*
- [ ] **Phase 1 + 2** (Core + density/columns/virtual scroll)
- [ ] **Phase 1-3** (Core + density + advanced filters)
- [ ] **Phase 1-4** (Core + density + filters + detail panel)
- [ ] **All phases** (Complete UX overhaul)

**My recommendation:** **Phase 1 + 2 + 3.3 (quick filter chips) + 5.3 (shareable URL) + 6.3 (keyboard) + 7.1 (dark mode)**

This gives:
- Professional viewing experience (lightbox, thumbnails, sort)
- Density control for power users
- Quick filter chips (high UX impact, low effort)
- Shareable URLs (collaboration)
- Keyboard + dark mode (accessibility/polish)

**Estimated: ~4-5 hours, single PR**

---

## 📝 Notes

- All features work within **read-only** architecture
- No new backend endpoints needed except sort params (Phase 1.3)
- localStorage for persistence (no auth required)
- Tigris images already served via public URL
- Turso handles all query complexity