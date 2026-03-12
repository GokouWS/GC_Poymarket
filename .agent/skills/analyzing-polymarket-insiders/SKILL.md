---
name: analyzing-polymarket-insiders
description: Analyzes Polymarket activity for insider trading signatures. Monitors WebSocket streams for large buys from fresh wallets and high topic proximity (e.g., military/political niches).
---

# Analyzing Polymarket Insiders

## When to use this skill
- When monitoring for high-conviction trades that preceded a major news event.
- When identifying "smart money" moving into obscure or niche markets.
- When vetting the sustainability of a market trend on Polymarket.

## Workflow
1. [x] **Stream Setup**: Initialize a WebSocket listener at `wss://ws-live-data.polymarket.com` for platform-wide trades.
2. [x] **Anomaly Detection**: Filter for transactions exceeding **$2,000** in value (configurable via `MONITOR_THRESHOLD_USD`).
3. [x] **Wallet Audit**: Cross-reference the trader's address via `polymarketService.getUserPositions`.
4. [x] **Signal Rating**: Automatically rate signals based on value and wallet freshness.

## Implemented Thresholds

| Category | Value / Requirement | Signal Rating |
|----------|---------------------|---------------|
| **Minimum Filter** | $2,000+ USD | (Logs trade) |
| **Whale Threshold** | $50,000+ USD | 🔥 WHALE |
| **Fresh Wallet Audit** | < 3 Active Positions | ⚠️ HIGH |
| **Critical Insider** | $10,000+ AND Fresh Wallet | 🚨 CRITICAL |

## Heuristics

### 1. The "Fresh Wallet" Signature
- **Rule**: If a wallet has < 3 active positions and its first trade is a $10k+ bet on a binary outcome, flag as "Critical Signal."
- **Logic**: Implemented in `PolymarketMonitorService` with automated position auditing.

### 2. Large Buy Thresholds
- **Standard Filter**: $2,000 USD is the minimum for background logging.
- **Audited Threshold**: $10,000 USD triggers a deep freshness check.
- **Whale Alert**: $50,000 USD triggers a global whale alert regardless of wallet age.

### 3. Topic Proximity (The "Expert" Trap)
- **Signature**: A trader who ONLY bets on "Israel Defense" or "FDA Approvals."
- **Rule**: If 80%+ of total volume is concentrated in one obscure category, treat as "High Probability Insider."

## Resources
- [Polymarket Service](file:///Users/wiokou/Documents/Code/AG/GC_Poymarket/src/services/polymarket-service.ts)
- [Polymarket Tools](file:///Users/wiokou/Documents/Code/AG/GC_Poymarket/src/tools/polymarket-tools.ts)
- [Polymarket API Docs](https://docs.polymarket.com/)

