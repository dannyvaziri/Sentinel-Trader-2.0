# Sentinel Trader companion

A private ChatGPT/Codex workflow using the existing official Robinhood connection. No credentials are bundled. No public web server or simulated account is required.

## Use

Enable Sentinel Trader and Robinhood in a task. Ask “Open Sentinel and refresh my Agentic dashboard.” A skill installation may require a new task to load. This installation belongs to this Mac; use the product's plugin sharing/import flow for another host, or attach `CHATGPT-START.md` in ChatGPT with Robinhood connected there.

## Included

- Live account/positions/orders workflow with source timestamps.
- Four research strategy profiles and four-perspective investment committee.
- Structured proposals, conservative deterministic checks and explicit final approvals.
- Kill-switch workflow and unknown-order reconciliation.
- Private SQLite event journal with transactional state transitions and hash verification.
- Responsive snapshot dashboard and portable conversation instructions.
- Tests use synthetic fixtures only, never a simulated user brokerage account or live trade.

## Boundaries

This is a companion, not a standalone brokerage app. The model can access Robinhood separately; checks do not enforce restrictions on that connector. Journal input and approval assertions come from the assistant. The kill switch pauses Sentinel, not other apps or already-submitted orders. Autonomous trading is unavailable. No permanent server, background job, cloud synchronization, independent AI agents, or automatic cross-device plugin availability is claimed.

## Privacy

Local history defaults to `~/Library/Application Support/Sentinel Trader/companion.sqlite3`. Owner-only file permissions protect the journal. Account identifiers are masked. Credentials are rejected by field name, and the workflow must never supply credential values under any key. Do not publish the journal or dashboard. This plugin source contains no account data.

## Tests

`python3 -m unittest discover -s tests -v`

`node --test tests/risk.test.mjs`

## Previous deployment investigation

The earlier claim that Robinhood cannot authorize a hosted MCP client was incorrect: official OAuth discovery and app registration succeeded. That alternative requires its own OAuth consent. The user selected this companion, which keeps the existing connection instead. The unfinished hosted implementation is not part of this plugin.
