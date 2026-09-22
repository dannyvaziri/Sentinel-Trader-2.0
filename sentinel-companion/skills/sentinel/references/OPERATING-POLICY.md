# Sentinel companion policy v1

Default mode: research. Kill switch: engaged. Live execution: disabled. No simulated account is created.

Default numerical checks: ETF allowlist SPY, VOO, VTI, QQQ, BND; $10 maximum order; 8% maximum resulting single-asset exposure; $20 maximum buy attempts per New York day; four maximum attempts per day; 2% loss threshold from first observed daily account value. Cash and unleveraged buying power only. These are conservative starter constraints, not investment recommendations. With a small account, whole-share ETF purchases may all be blocked. Do not silently relax limits to make a trade pass.

Whole-share, good-for-day limit orders in regular market hours are the only supported execution shape in v1. No options, crypto, leverage, shorting, autonomous execution, or after-hours trading. A weekday/time check is not an exchange holiday calendar; require current bid/ask timestamps and broker review as well. Market holidays, missing quotes, halts, and broker alerts keep execution blocked.

Quote age must be at most 60 seconds; account snapshot age at most 30 seconds. Maximum spread is 0.5%, and limit price must be within 1% of the applicable quote. Account identity must match, be active and agent-accessible. Any open equity order or unresolved submission blocks new execution. Fetch other asset orders as part of the review; unsupported asset exposure needs manual review. Journal approval age is at most 60 seconds, and a new quote/risk check is required just before submission.

The daily loss baseline is first observed account value, not a guarantee of realized or intraday loss. Deposits, withdrawals and market gaps affect this calculation. If baseline or data coverage is missing, block execution.

## Risk helper input

Run `node scripts/risk.mjs` with JSON stdin containing:

```
{
  "intent": {"symbol":"OWNER_SELECTED", "side":"buy", "type":"limit", "quantity":"OWNER_SPECIFIED", "limit_price":"OWNER_SPECIFIED"},
  "snapshot": {"at":0, "account":{"account_number":"ephemeral identifier", "agentic_allowed":true,"state":"active"}, "portfolio":{"total_value":"broker value","cash":"broker value","buying_power":{"unleveraged_buying_power":"broker value"}},"positions":[],"orders":[]},
  "quote": {"state":"active","has_traded":true,"ask_price":"broker value","bid_price":"broker value","venue_ask_time":"broker timestamp","venue_bid_time":"broker timestamp"},
  "state": {"account":"same ephemeral identifier", "proposals":[],"kill":true,"live":false,"mode":"research","baseline":{"date":"YYYY-MM-DD","value":0}},
  "execution": false
}
```

Use actual broker values, never the example placeholders. Add `snapshot.complete: true` only after every relevant position/order category, including advanced orders, is verified. Missing connector tools or incomplete pagination must leave it false. Full account identifiers may be used in ephemeral helper input but must not be written to the journal or dashboard. `proposals` in this input must include all attempts/uncertain submissions from journal history, not only visible recent proposals. The execution flag adds live, mode, kill-switch and regular-hours checks. `allowed` is a computed report and is not authorization to trade.

## Explicit confirmations

There are separate state changes: enabling approval mode, releasing the kill switch, and confirming one exact broker order. The owner can keep approval mode enabled while requiring confirmation for every trade. A general instruction such as "finish the setup" never confirms a trade.

## Journal limits

SQLite transactions serialize journal changes. Hash links detect ordinary tampering and corruption; a party with full filesystem access could rewrite the database and all hashes. Treat the journal as a private operational record, not a regulator-certified audit store. The local OS account protects its files. It stores redacted account observations and trading rationale, never OAuth tokens. A different device will not automatically have this journal. Use a private export when intentionally moving history.
