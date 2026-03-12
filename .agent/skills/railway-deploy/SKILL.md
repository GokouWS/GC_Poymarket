---
name: GitHub to Railway Deploy
description: Procedures for deploying Gravity Claw via GitHub Auto-Deploy to Railway
---

# Railway Standard Operating Procedures — Gravity Claw

> A step-by-step guide for deploying and managing your Gravity Claw AI agent on Railway via GitHub auto-deployments.

---

## Your Project Details

| Key | Your Value |
|-----|------------|
| **Project Name** | GC_Poymarket |
| **GitHub Repo** | `GokouWS/GC_Poymarket` |
| **Environment** | `production` |
| **Package Manager**| `pnpm` |

---

## Prerequisites

1. **GitHub CLI installed (optional but helpful)**
2. **Project linked on Railway to your GitHub Repository**
   This was completed during the Level 6 deployment. Railway automatically listens to the `main` branch.

---

## The Dev Cycle

```
1. Test Locally  →  2. Type-Check  →  3. Git Push (Deploy)  →  4. Verify
```

### Phase 1: Test Locally

Start the local dev server with hot-reload:

```bash
pnpm run dev
```

This runs `tsx watch src/index.ts` — auto-restarts on code changes. Interact with your bot on Telegram to test changes in real time.

When done, stop the local server (`Ctrl+C`).

### Phase 2: Type-Check

Always ensure there are no compilation errors before deploying to avoid a continuous crash loop on Railway.

```bash
npx tsc --noEmit
```

### Phase 3: Deploy via GitHub

Because Railway is linked to your GitHub repository, **deploying simply means pushing your code to the `main` branch.**

```bash
git add .
git commit -m "chore: deploy update"
git push origin main
```

Railway will automatically detect the push and trigger a new deployment. 

**Updating Environment Variables:**
If you added new environment variables locally in `.env` or updated your `mcp_config.json`:
1. Go to your Railway Dashboard -> Gravity Claw -> Variables.
2. Add the new keys/values directly into the Railway UI. Examples include:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (Optional - defaults to `gemini-2.5-pro`)
   - `OPENAI_API_KEY`
   - `ELEVENLABS_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `PINECONE_API_KEY`
   - `PINECONE_INDEX_NAME`
   - `ALLOWED_USER_IDS`
3. For MCP configurations, update the `MCP_CONFIG` environment variable with the raw JSON string of your new `mcp_config.json`.

### Phase 4: Verify

You can monitor the deployment status by visiting your [Railway Dashboard](https://railway.app/dashboard). Once it resolves, the bot will automatically swap to the new version.

---

## Quick Reference

| Task | Command |
|------|---------|
| Start local dev | `pnpm run dev` |
| Type-check | `npx tsc --noEmit` |
| Deploy to Railway | `git push origin main` |

---

## Things to Know

### Supabase Core Memory
The short-term and long-term memory is entirely housed in Supabase (Postgres). It persists safely across deployments and scaling events.

### MCP Config is secured via ENV
`mcp_config.json` is deliberately in `.gitignore` to prevent leaking the Supabase Anon Key. Railway reads this configuration from the `MCP_CONFIG` environment variable. 

---

## AI Agent Skill (for Antigravity / Gemini users)

If you're using an AI coding agent, this skill works seamlessly. You never have to touch Railway yourself. Just invoke the slash command:
`/deploy`

- **Skill location:** `.agent/skills/railway-deploy/SKILL.md`
- **Workflow location:** `.agent/workflows/deploy.md`
