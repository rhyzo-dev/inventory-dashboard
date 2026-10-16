# Inventory Dashboard — Client Handover Pack

Everything a client, operator, or maintainer needs to understand, use, and run the
Inventory Dashboard. Developer/ops docs are in **English**; operator-facing docs (User
Guide/SOP and Glossary) are in **English and 中文**.

> **The app:** a multi-lot consumable-inventory tool for a manufacturing plant — track
> lots, bins, and expiry; issue soonest-expiring-first (FEFO); bulk-import; catch
> duplicates and expiries before they bite.

## Where to start

- **New to the project / the client review** → open the
  [showcase portal](showcase.html) first — a single self-contained page that sketches the
  system, its architecture, the lot data model, the UX schematics, and the security
  posture. It's the "handover in one screen" view.
- **Deep dive** → the numbered docs below.

## Documentation index

### Developer / technical (English)
| # | Doc | What's in it |
|---|-----|--------------|
| 01 | [Architecture](en/01-architecture.md) | system picture, data flows, and the **ADRs** |
| 02 | [Data model](en/02-data-model.md) | tables, the "lot" concept, migrations 0001–0006 |
| 03 | [API reference](en/03-api-reference.md) | endpoints, request/response shapes, rate limits |
| 04 | [Security & Access Policy](en/04-security-policy.md) | secrets, auth, roles, credential & data policy |
| 05 | [Deployment & Ops runbook](en/05-deployment-ops.md) | setup, deploy, two instances, backups, rotations |
| 06 | [UX Design & Schematics](en/06-ux-design.md) | principles, design language, page-flow + wireframes |
| 07 | [User Guide / SOP](en/07-user-guide-sop.md) | day-to-day operations (EN) |
| 08 | [Glossary](en/08-glossary.md) | FEFO, lot, D1, Tigris, … |
| 09 | [Changelog & Testing](en/09-changelog-testing.md) | recent changes, quality gates, publish checklist |

### 中文 operator docs
| # | Doc | |
|---|-----|---|
| 07 | [用户手册 / SOP](zh/07-user-guide-sop.md) | 日常操作 |
| 08 | [术语表](zh/08-glossary.md) | FEFO / 批次 / 货位 / 阈值 … |

## Who reads what
- **Plant operators** → [07 User Guide / SOP](zh/07-user-guide-sop.md) (中文) · [08 Glossary](zh/08-glossary.md)
- **Developers / integrators** → 01 · 02 · 03 · 06
- **Ops / security** → 04 · 05 · 09
- **A client reviewing the whole system** → 01 first, then 06 (how it looks), then 04/05 (how it's protected & run)

## Related in-repo references
- [`seeds/README.md`](../seeds/README.md) — demo-instance setup & reset
- [`seeds/demo-data.sql`](../seeds/demo-data.sql) — demo user + sample dataset
- `wrangler.toml` — Pages project (non-secret config only)
- `migrations/` — D1 schema (apply in order)
