---
description: Procedures for deploying Gravity Claw via GitHub Auto-Deploy to Railway
---

# Deploy Workflow

Follow these steps to deploy the current state of the repository to Railway.

1. **Type-Check**
Verify the code compiles without errors.
```bash
npx tsc --noEmit
```

2. **Commit Changes**
Stage and commit all your work.
```bash
git add .
git commit -m "feat: implement polymarket monitor and heartbeat refinement"
```

3. **Deploy (Push to Main)**
Railway automatically deploys when you push to the `main` branch.
```bash
git push origin main
```

4. **Update Railway Variables**
Ensure new environment variables are added in the Railway UI:
- `MONITOR_THRESHOLD_USD`
- `MONITOR_ENABLED`
- `MCP_CONFIG` (if updated)
