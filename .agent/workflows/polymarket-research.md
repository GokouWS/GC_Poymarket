---
description: Workflow for researching markets and identifying signals on Polymarket.
---

# Polymarket Research Workflow

Follow these steps to research a topic or identify potential insider signals.

1. **Market Scouting**
   - Use `search_polymarket_markets` to find markets related to your topic (e.g., "AI", "Election", "Middle East").
   - Filter for markets with significant volume (e.g., > $100k for macro events, > $10k for micro).

2. **Deep Dive**
   - Select a high-interest market ID.
   - Use `get_polymarket_market_details` to check current odds, outcomes, and descriptions.
   - Compare the current odds with external news sources to find "mispriced" outcomes.

3. **Insider/Signal Audit**
   - Identify if there are sudden price spikes without clear news triggers.
   - Use `get_polymarket_user_positions` to check the holdings of top traders (if their addresses are known or found in news).

4. **Recommendation**
   - Based on volume, price action, and external context, provide a summary of the market sentiment and any "insider" potential.
