---
name: document-ai-hero-api
description: "Generate or update documentation for the AI Hero API by reading the source code at ~/repos/ai/course-builder. Use when user wants to document, update docs for, or understand the AI Hero API endpoints."
---

# Document AI Hero API

Generate/update API documentation by reading the AI Hero source code.

## Prerequisites: Ensure Read Permissions

Before reading the AI Hero source, update `.claude/settings.local.json` to include read permission for the course-builder repo. Add this entry to the `permissions.allow` array if not already present:

```
"Read(/home/mattpocock/repos/ai/course-builder/**)"
```

## Workflow

### 1. Scan API Source

Read the AI Hero API source at `~/repos/ai/course-builder/apps/ai-hero/src/`. Focus on:

- **REST endpoints**: `src/app/api/` — each folder is a route segment. Read every `route.ts` file.
- **tRPC routers**: `src/trpc/api/routers/` — each file is a typed RPC router.
- **Database schema**: `src/db/schema.ts` — table definitions and relationships.
- **Auth**: `src/app/api/auth/` and any middleware files for auth patterns.

### 2. For Each Endpoint, Capture

- HTTP method + path (REST) or procedure name + type (tRPC query/mutation)
- Request body / query params with TypeScript types
- Response shape with TypeScript types
- Auth requirements (public, Bearer token, session, HMAC)
- Side effects (Inngest events, webhooks, S3 uploads)

### 3. Cross-Reference with This Project

Check how endpoints are consumed in this codebase:

- `app/services/ai-hero-auth-service.ts` — OAuth device flow
- `app/services/ai-hero-upload-service.ts` — Upload & post creation
- `app/features/upload-manager/` — SSE client for progress

Flag any endpoints used here that have changed in the source.

### 4. Write Documentation

Output to `docs/ai-hero-api.md` in this repo. Follow the structure in [TEMPLATE.md](TEMPLATE.md).

### 5. Summary

After updating, print a short summary of:

- Number of endpoints documented
- Any breaking changes detected vs. current usage
- Any new endpoints not yet consumed by this project
