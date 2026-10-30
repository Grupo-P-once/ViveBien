<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->

## Claude Code ↔ Codex Collaboration Protocol

**Roles (fixed).** Claude Code is the architect, orchestrator, and primary implementer — it is the only one that modifies the working tree. Codex is a second, independent engineer: challenger and reviewer. Codex never modifies Claude's working tree during a review.

**Levels.**
- **0 — trivial:** no Codex.
- **1 — normal:** one Codex review.
- **2 — architecture/security/data:** debate first, max 2 rounds.
- **3 — critical or needs isolation:** max 3 rounds.

**Debate.** Use the existing format: `PROBLEMA → EVIDENCIA → IMPACTO → CORRECCIÓN PROPUESTA`. No architectural debate for Level 0/1. On reaching the round limit without agreement, stop — do not continue indefinitely. Log the pending decision with the existing system (`docs/DECISIONS.md`, and an ADR under `docs/adr/` when it's architectural). Unresolved disagreement is decided by the user.

**Review.** For Level 1, use Codex's native review on the concrete scope of the change: prefer `codex review --uncommitted`, `--base`, or `--commit` as applicable. Do not build custom review scripts absent a demonstrated need. For Level 2/3, use isolation/worktree only when actually necessary.

**Context and tokens.** Never hand Codex the whole repository. Pass only: goal, constraints, relevant files, and the necessary diff/change. Reuse `docs/DECISIONS.md` and `docs/adr/` for decisions that already exist. Never include `.env` files, credentials, tokens, secrets, or other sensitive content in a handoff.

**Git.** No automatic push, deploy, merge, or destructive actions. The VIVE BIEN private remote is the valid destination for project work. Do not modify or delete existing branches without explicit authorization.

**Documentation.** `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md`, and `docs/adr/` remain the technical sources of truth. Do not create a second decision system for Claude↔Codex.
