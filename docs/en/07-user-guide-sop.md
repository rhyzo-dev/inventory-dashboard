# 07 · User Guide / SOP

> Client-handover pack · [index](../README.md). Day-to-day operations for plant staff.
> 中文版: [用户手册 / SOP](../zh/07-user-guide-sop.md) · 中文术语表: [glossary](../zh/08-glossary.md)

## 1. Signing in
1. Open the dashboard URL. Enter your username and password.
2. First use: an admin creates your account (or you use the demo login on the public demo
   instance — `demo` / `Demo@2026!`).
3. Forgetting your password: an admin resets it in the Users panel.

**Roles.** `viewer` reads; `editor` adds/updates items, categories, units; `admin` adds all
of that plus deletes, user management, and threshold editing.

## 2. Reading the dashboard
- **Stat cards** across the top are quick counts: **All**, **Low**, **Out**, **Expiring
  soon**, and **Expired**. Click a card to filter the list to that group.
- **Expired** (red) = past its expiry date — do not use, dispose per procedure.
- **Expiring soon** (amber) = expires within 30 days — plan to use it up first.
- The **Expiry** column shows the date plus a colored hint: red "Expired · −Nd", amber
  "+Nd · expiring soon", green otherwise.

## 3. Adding items
### A single item
1. **Add Item** (top right). Fill SKU, name, quantity, unit, bin, category, specification,
   and mfg/expiry dates.
2. **Duplicate warning:** if you re-enter a lot that already exists (same SKU + name + bin +
   spec + mfg + expiry), the form shows a warning with the matching lots. You must tick
   **"Add anyway"** to force it; otherwise the save is blocked. A genuinely new lot (any
   field different) saves normally.

### Many items at once (bulk import)
1. **Import Items** → **Download template** (`.xlsx` or `.csv`).
2. Fill the **Rows** sheet: `sku` is required; the other columns are optional but the more
   you fill, the better the dedup.
3. Upload the file. The app shows a **preview** (how many will be created, how many will be
   skipped as duplicates). Confirm to commit.
4. **Duplicates are skipped and reported — never overwritten.** So re-importing a file is
   safe; it will not create double lots.

## 4. Categories & units
Create your own **categories** and **units** from the panels (editor+). New categories
appear automatically in the filter dropdowns. Deleting a category or unit is blocked while
any item still uses it — reassign items first.

## 5. By-SKU view & thresholds
- The **By-SKU (FEFO)** tab shows, per SKU: total on hand across all lots, lot count,
  soonest expiry, and the issue order (soonest-expiring lot first).
- **Thresholds:** most SKUs don't need one. For fast-moving items, set a per-SKU min/max in
  the Thresholds modal. A SKU with no threshold simply shows none.

## 6. Photos
Hover a row to **add** or **remove** a photo. Images are stored securely and are shown via
the app (not a public URL).

## 7. Common tasks
| I want to… | Do this |
|------------|---------|
| See what's about to expire | Expiring soon card, or **View → Expiring Soon** |
| See what's already bad | Expired card, or **View → Expired Only** |
| Know which lot to issue | By-SKU view, expand the row (FEFO order) |
| Re-stock a SKU | Add Item, or bulk import |
| Export the list | Export → CSV / XLSX |

## 8. Troubleshooting
- **Account locked** — too many bad passwords; wait 15 minutes or ask an admin.
- **"This password was in a breach"** on change — pick a stronger one.
- **Import skipped rows** — that's the duplicate guard working; check the preview for which.
- **No items after import** — confirm you filled the `sku` column and pressed commit.
