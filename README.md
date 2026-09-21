# WINS Cash Flow

Bilingual (Arabic/English) cash collection & handover tracker for multi-branch retail.

## What it does

- Branches record daily **Sales** (Card/Mada, Cash, Other electronic) and **Expenses** (with optional receipt photo).
- The app computes **Cash On Hand** per branch = Cash Sales − Expenses − amounts already handed over.
- A three-step **Cash Handover** approval chain: **Branch Manager declares → Collector confirms pickup (flags shortages) → Treasury gives final confirmation**.
- Roles: Admin, Branch Manager, Collector, Treasury — each with a tailored dashboard, desktop sidebar + mobile bottom-nav layout.
- Every account is protected by a PIN set at registration (hashed client-side, never stored in plain text).

## Running it

`index.html` is a single self-contained page. It is built as a Claude Artifact: when opened inside claude.ai it uses a live shared database capability so every branch/role sees the same real-time data. Opened anywhere else, it falls back to a local-only demo mode (data saved to that browser only) so the UI is still fully explorable.

## Status

Actively being iterated — see commit history for progress.
