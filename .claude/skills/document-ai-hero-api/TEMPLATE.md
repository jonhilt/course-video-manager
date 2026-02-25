# AI Hero API Documentation Template

Use this structure when writing `docs/ai-hero-api.md`.

---

````markdown
# AI Hero API Reference

> Auto-generated from source at `~/repos/ai/course-builder/apps/ai-hero/src/`.
> Last updated: {DATE}

## Authentication

### OAuth Device Authorization Grant

{Document the device auth flow: endpoints, request/response shapes}

### Bearer Token

{How tokens are used in subsequent requests}

## REST Endpoints

### Posts

#### `POST /api/posts` — Create Post

- **Auth**: Bearer token
- **Request body**:
  ```typescript
  {
    title: string;
    postType: string;
  }
  ```
````

- **Response**:
  ```typescript
  {
    id: string;
    slug: string;
  }
  ```

#### `PUT /api/posts?id={id}&action=save` — Update Post

{...}

#### `PUT /api/posts?id={id}&action=publish` — Publish Post

{...}

{Repeat for each REST endpoint}

### Uploads

#### `GET /api/uploads/signed-url?objectName={name}` — Get Signed Upload URL

{...}

#### `POST /api/uploads/new` — Trigger Video Processing

{...}

### Products

{...}

### Lessons

{...}

### Surveys

{...}

### Commerce

{...}

### Media (Mux, Thumbnails)

{...}

### Short Links

{...}

### Webhooks & Integrations

{...}

### Support Platform

{...}

## tRPC Procedures

### ability

{List each procedure with input/output types}

### users

{...}

### videoResources

{...}

### posts

{...}

{Repeat for each tRPC router}

## Data Models

### Key Database Tables

{Table name, columns, relationships — only the ones relevant to API contracts}

## Changelog

| Date   | Change                |
| ------ | --------------------- |
| {DATE} | Initial documentation |

```

```
