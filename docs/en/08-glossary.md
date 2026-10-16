# 08 · Glossary

> Client-handover pack · [index](../README.md). 中文: [术语表](../zh/08-glossary.md).

| Term | Meaning |
|------|---------|
| **SKU** | Stock-keeping code — a *catalog* identifier. Not unique: one SKU can have many lots. |
| **Lot** | One physical batch of a SKU, identified by its bin, mfg/expiry dates, and spec. A `consumable_item` row is a lot. |
| **Bin location** | Where a lot physically sits (shelves, cages, stores). |
| **FEFO** | *First-Expired, First-Out* — issue the soonest-expiring lot first. |
| **Expiring soon** | Expiry within the next 30 days (future only). |
| **Expired** | Expiry date already in the past. Kept distinct from "expiring soon." |
| **Min / max threshold** | Optional per-SKU (or per-lot) low-stock bounds that drive the Low / Out status. |
| **Lot key** | The six-field identity used for dedup & import: SKU + name + bin + spec + mfg + expiry. |
| **Dry run** | An import preview that reports what *would* happen without committing. |
| **D1** | Cloudflare's managed SQLite database. |
| **Tigris** | S3-compatible object storage (holds item photos). |
| **JWT** | The signed session token (access token, 8 h) plus a stored refresh token (7 d). |
