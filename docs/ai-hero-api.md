# AI Hero API Reference

> Auto-generated from source at `~/repos/ai/course-builder/apps/ai-hero/src/`.
> Last updated: 2026-02-25

## Overview

The AI Hero API is a hybrid Next.js 16 application using both REST endpoints (App Router) and tRPC for typed client-server communication. It supports OAuth device authorization, content management, e-commerce, video hosting (Mux), and real-time collaboration (PartyKit).

**Base URL:** Configured via `AI_HERO_BASE_URL` env var (e.g., `https://www.aihero.dev`)

---

## Authentication

### OAuth Device Authorization Grant

Used by this project for non-browser authentication (CLI/device flow).

#### 1. Request Device Code

```
POST /oauth/device/code
Content-Type: application/json
```

**Response:**

```typescript
{
  device_code: string; // Server-side polling code
  user_code: string; // 8-char human-readable code (hri library)
  verification_uri: string; // "/activate"
  verification_uri_complete: string; // "/activate?user_code=..."
  expires_in: number; // 600 (10 minutes)
  interval: number; // 5 (seconds between polls)
}
```

#### 2. Poll for Token

```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

device_code={deviceCode}&grant_type=urn:ietf:params:oauth:grant-type:device_code
```

**Response (pending):**

```json
{ "error": "authorization_pending" }
```

**Response (success):**

```typescript
{
  access_token: string; // UUID token
  token_type: "bearer";
  scope: "content:read progress";
}
```

Poll every 5 seconds for up to 10 minutes. Handle `authorization_pending` and `slow_down` errors gracefully.

#### 3. Get User Info

```
GET /oauth/userinfo
Authorization: Bearer {access_token}
```

**Response:**

```typescript
{
  id: string;
}
```

#### 4. OpenID Discovery

```
GET /.well-known/openid-configuration
```

Exposes OAuth endpoint metadata for device flow integration.

### Bearer Token Authentication

Most API endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer {access_token}
```

The token is obtained via the device authorization flow above. Internally, the API resolves the token to a user via the `DeviceAccessToken` table and checks abilities using CASL.

### Session-Based Authentication (NextAuth)

Used by the web UI. Supports OAuth providers (GitHub, Discord, Twitter) and email magic links. Sessions are stored in the database.

---

## REST Endpoints

### Posts

#### `POST /api/posts` — Create Post

- **Auth:** Bearer token (requires `create Content` ability)
- **Request:**
  ```typescript
  {
    title: string;
    postType: "article";  // or other post types
    videoResourceId?: string;
    createdById?: string;
  }
  ```
- **Response:**
  ```typescript
  {
    id: string;
    slug: string;
  }
  ```
- **Status:** 201 (created), 400 (validation), 401, 500

#### `GET /api/posts` — Get Posts

- **Auth:** Bearer token
- **Query:** `?slugOrId={id-or-slug}` (optional — returns single post or all)
- **Response:** Post object(s) validated against `PostSchema`
- **Status:** 200, 400, 401, 500

#### `PUT /api/posts?id={id}&action=save` — Update Post

- **Auth:** Bearer token (requires user session)
- **Query:** `id` (required), `action=save`
- **Request:**
  ```typescript
  {
    id: string;
    fields: {
      title: string;
      slug: string;
      body: string; // Markdown content
      description: string; // SEO description
    }
    tags: Array<any>;
  }
  ```
- **Response:** Updated post object
- **Status:** 200, 400, 401, 500
- **Side effects:** Cache invalidation, Typesense index update

#### `PUT /api/posts?id={id}&action=publish` — Publish Post

- **Auth:** Bearer token
- **Query:** `id` (required), `action=publish`
- **Request:** `{}` (empty body)
- **Response:** Updated post object
- **Status:** 200, 400, 401, 500

#### `DELETE /api/posts?id={id}` — Delete Post

- **Auth:** Bearer token
- **Query:** `id` (required)
- **Response:** Deleted post object
- **Status:** 200, 401, 404, 500
- **Side effects:** Removes from database and Typesense

### Uploads

#### `GET /api/uploads/signed-url` — Get Signed S3 Upload URL

- **Auth:** None (public)
- **Query:** `?objectName={filename}` (required)
- **Response:**
  ```typescript
  {
    signedUrl: string; // PUT presigned URL for uploading
    publicUrl: string; // Stable public URL after upload
    filename: string;
    objectName: string;
  }
  ```
- **Status:** 200, 400 (missing filename)

#### `POST /api/uploads/new` — Trigger Video Processing

- **Auth:** Bearer token (requires `create Content` ability)
- **Request:**
  ```typescript
  {
    file: {
      url: string;   // Public URL from signed-url step
      name?: string;
    };
    metadata: {
      parentResourceId: string; // Post ID to attach video to
    };
  }
  ```
- **Response:** `{ success: true }`
- **Status:** 200, 400 (validation), 401, 500
- **Side effects:** Sends Inngest `VIDEO_UPLOADED_EVENT` with `originalMediaUrl`, `fileName`, `title`, `parentResourceId`, `user`

### Products

#### `GET /api/products` — List Products

- **Auth:** Bearer token (requires `read Content` ability)
- **Query:** `?slugOrId={id-or-slug}` (optional — returns single or all)
- **Response:** Full nested structure: `Product → Cohort → Workshops → Sections → Lessons`
- **Status:** 200, 401, 404, 500

#### `GET /api/products/{productId}/availability` — Get Seat Availability

- **Auth:** None (public)
- **Response:**
  ```typescript
  {
    quantityAvailable: number; // -1 = unlimited
    unlimited: boolean;
  }
  ```
- **Status:** 200, 400, 404, 500

### Lessons

#### `GET /api/lessons` — Get Lessons

- **Auth:** Bearer token
- **Query:** `?slugOrId={id-or-slug}`
- **Response:** Lesson object(s) validated against `LessonSchema`
- **Status:** 200, 400, 401, 500

#### `PUT /api/lessons` — Update Lesson

- **Auth:** Bearer token (requires user session)
- **Query:** `?id={lesson-id}`
- **Request:** `{ action?: string, ...LessonUpdate }`
- **Response:** Updated lesson object
- **Status:** 200, 400, 401, 500
- **Side effects:** Cache invalidation (`revalidatePath`/`revalidateTag`), Typesense update

#### `GET /api/lessons/{lessonId}/solution` — Get Solution

- **Auth:** Bearer token
- **Response:** Solution object
- **Status:** 200, 401, 404, 500

#### `POST /api/lessons/{lessonId}/solution` — Create Solution

- **Auth:** Bearer token (requires user session)
- **Request:** `NewSolutionInput` (Zod-validated)
- **Response:** Created solution
- **Status:** 201, 400, 401, 500

#### `PUT /api/lessons/{lessonId}/solution` — Update Solution

- **Auth:** Bearer token
- **Request:** `SolutionUpdate` (Zod-validated)
- **Response:** Updated solution
- **Status:** 200, 400, 401, 500

#### `DELETE /api/lessons/{lessonId}/solution` — Delete Solution

- **Auth:** Bearer token
- **Response:** Deleted solution
- **Status:** 200, 401, 404, 500

### Video Resources

#### `GET /api/{videoResourceId}` — Get Video Resource

- **Auth:** Bearer token (requires `create Content` ability)
- **Response:** VideoResource object
- **Status:** 200, 401, 404, 500
- **CORS:** Enabled (all origins)

### Surveys

#### `GET /api/surveys` — List Surveys

- **Auth:** Bearer token (requires `manage all` for admin access)
- **Query:** `?slugOrId={id-or-slug}` or `?search={query}`
- **Response:** `SurveyWithQuestions` object or array
- **Status:** 200, 401, 403

#### `POST /api/surveys` — Create Survey

- **Auth:** Bearer token
- **Request:** `CreateSurveyApiInputSchema` (Zod-validated)
- **Response:** Created `SurveyWithQuestions`
- **Status:** 201, 400, 401, 500

#### `PATCH /api/surveys` — Update Survey

- **Auth:** Bearer token
- **Request:** `UpdateSurveyApiInputSchema`
- **Response:** Updated `SurveyWithQuestions`
- **Status:** 200, 400, 401, 500

#### `DELETE /api/surveys?id={id}` — Delete Survey

- **Auth:** Bearer token
- **Status:** 200, 400, 401, 500

#### `GET /api/surveys/analytics?slugOrId={id}` — Survey Analytics

- **Auth:** Bearer token (requires user session)
- **Response:** `SurveyAnalytics` aggregate object
- **Status:** 200, 400, 401, 500

### Short Links

#### `GET /api/shortlinks` — List Short Links

- **Auth:** Bearer token (requires `manage all` — admin only)
- **Query:** `?id={link-id}` or `?search={query}`
- **Response:** Single shortlink or array
- **Status:** 200, 401, 403, 404

#### `POST /api/shortlinks` — Create Short Link

- **Auth:** Bearer token (requires `create Content`)
- **Request:**
  ```typescript
  {
    slug?: string; // 1-50 chars, alphanumeric + dash + underscore
    url: string;   // Required
    description?: string;
  }
  ```
- **Response:** Created shortlink
- **Status:** 201, 400, 401, 403, 409 (slug exists), 500

#### `PATCH /api/shortlinks` — Update Short Link

- **Auth:** Bearer token (requires `update Content`)
- **Request:** `{ id: string; slug?: string; url?: string; description?: string }`
- **Response:** Updated shortlink
- **Status:** 200, 400, 401, 403, 404, 409, 500

#### `DELETE /api/shortlinks?id={id}` — Delete Short Link

- **Auth:** Bearer token (requires `delete Content`)
- **Status:** 200, 400, 401, 403, 404, 500

### Media

#### `GET /api/thumbnails` — Get Video Thumbnail

- **Auth:** None (public)
- **Query:** `?videoResourceId={id}&time={timestamp}`
- **Response:** Binary PNG image
- **Headers:** `Content-Type: image/png`, `Cache-Control: public, max-age=31536000, immutable`
- **Behavior:** Fetches from Mux: `https://image.mux.com/{playbackId}/thumbnail.png?time={time}&width=320`
- **Status:** 200, 400, 404, 500

#### `POST /api/mux` — Create Mux Direct Upload

- **Auth:** Mux API credentials (server-side)
- **Response:** Mux upload session data with signed upload URL
- **Status:** 200, 500

### Chat

#### `POST /api/chat` — AI Chat

- **Auth:** None (rate-limited: 5 req/10s per IP via Redis)
- **Request:**
  ```typescript
  {
    messages: Array<{ role: string; content: string }>;
  }
  ```
- **Response:** SSE stream (via `ai` SDK, model: `gpt-4o`)
- **Rate limit headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Status:** 200, 429 (rate limited)

### Commerce

#### `GET/POST /api/coursebuilder/[...nextCourseBuilder]` — Course Builder SDK

Proxy for Course Builder SDK endpoints (commerce flows, purchases).

#### `POST /api/coursebuilder/subscribe-to-list/convertkit` — Newsletter Signup

- **Auth:** None
- **Request:** `{ email: string, ...otherFields }`
- **Response:** 200 on success
- **Side effects:** Creates shortlink attribution entry if `sl_ref` cookie present

### Webhooks

#### `POST /api/mux/webhook` — Mux Video Processing

- **Auth:** HMAC signature (TODO — not fully implemented)
- **Request:** `MuxWebhookEventSchema` (Zod-validated)
- **Side effects:** Sends Inngest `MUX_WEBHOOK_EVENT`
- **Status:** 200

#### `POST /api/ocr/webhook` — OCR Processing

- **Auth:** None
- **Request:** `OcrWebhookEventSchema` with `screenshotUrl`
- **Side effects:** Sends Inngest `OCR_WEBHOOK_EVENT`
- **Status:** 200

#### `POST /api/postmark/webhook` — Email Delivery

- **Auth:** HMAC via `course-builder` header matching `POSTMARK_WEBHOOK_SECRET`
- **Side effects:** Sends Inngest `POSTMARK_WEBHOOK_EVENT` (silent auth failure — always returns 200)
- **Status:** 200

#### `POST /api/support/[...action]` — Support Platform

- **Auth:** HMAC-SHA256 signature via `SUPPORT_WEBHOOK_SECRET`
- **Actions:** `lookupUser`, `getPurchases`, `revokeAccess`, `transferPurchase`, `generateMagicLink`, `updateEmail`, `updateName`
- **Status:** 200, 400, 403 (invalid signature), 503 (not configured)

### Infrastructure

#### `GET /api/cron` — Refresh Inngest

Triggers Inngest configuration refresh. Public, no auth.

#### `GET/POST/PUT /api/inngest` — Inngest Event Handler

Inngest event ingestion endpoint. Max duration: 300s.

#### `GET/POST /api/uploadthing` — File Upload

UploadThing file upload handler.

#### `GET/POST /api/trpc/[trpc]` — tRPC Bridge

HTTP bridge to all tRPC routers at `/api/trpc`.

#### `GET/POST /api/auth/[...nextauth]` — NextAuth

Session-based auth. Providers: GitHub, Discord, Twitter, Email (magic link).

---

## tRPC Procedures

All tRPC procedures are accessible via the HTTP bridge at `/api/trpc/{router}.{procedure}`.

### `ability`

| Procedure                        | Type  | Auth   | Input                                      | Output              |
| -------------------------------- | ----- | ------ | ------------------------------------------ | ------------------- |
| `getCurrentAbilityRules`         | query | public | `{ lessonId?: string; moduleId?: string }` | Ability rules array |
| `getCurrentSubscriberFromCookie` | query | public | —                                          | Subscriber data     |

### `users`

| Procedure         | Type     | Auth                | Input                | Output              |
| ----------------- | -------- | ------------------- | -------------------- | ------------------- |
| `get`             | query    | public              | `{ userId: string }` | User object or null |
| `githubConnected` | query    | public              | —                    | `boolean`           |
| `updateName`      | mutation | public (auth check) | `{ name: string }`   | `{ name: string }`  |

### `videoResources`

| Procedure        | Type     | Auth      | Input                                            | Output                 |
| ---------------- | -------- | --------- | ------------------------------------------------ | ---------------------- |
| `get`            | query    | public    | `{ videoResourceId?: string }`                   | Video resource or null |
| `getAll`         | query    | protected | —                                                | Video resources array  |
| `getPaginated`   | query    | protected | `{ limit: 1-100 (default 20); cursor?: string }` | Paginated results      |
| `attachToPost`   | mutation | protected | `{ postId: string; videoResourceId: string }`    | Result                 |
| `detachFromPost` | mutation | protected | `{ postId: string; videoResourceId: string }`    | Result                 |

### `contentResources`

| Procedure                     | Type  | Auth      | Input                                             | Output                  |
| ----------------------------- | ----- | --------- | ------------------------------------------------- | ----------------------- |
| `getList`                     | query | public    | `{ slugOrId: string }`                            | List resource           |
| `getAll`                      | query | protected | `{ contentTypes?: string[] }`                     | Content resources array |
| `getPublishedResourcesLength` | query | public    | —                                                 | `number`                |
| `getWorkshop`                 | query | protected | `{ id: string }`                                  | Workshop resource       |
| `getNextWorkshopInCohort`     | query | public    | `{ cohortId: string; currentWorkshopId: string }` | Next workshop or null   |

### `pricing`

| Procedure          | Type  | Auth   | Input                                                                                                | Output                              |
| ------------------ | ----- | ------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `propsForCommerce` | query | public | `{ code?; coupon?; allowPurchase?; productId? }`                                                     | Commerce props                      |
| `formatted`        | query | public | `{ productId?; quantity; couponId?; merchantCoupon?; upgradeFromPurchaseId?; autoApplyPPP?; code? }` | Formatted pricing                   |
| `defaultCoupon`    | query | public | —                                                                                                    | Default coupon with product or null |

### `progress`

| Procedure                  | Type     | Auth   | Input                              | Output                 |
| -------------------------- | -------- | ------ | ---------------------------------- | ---------------------- |
| `add`                      | mutation | public | `{ resourceId: string }`           | Progress data          |
| `toggle`                   | mutation | public | `{ lessonSlug: string }`           | Progress data          |
| `getNextResource`          | query    | public | `{ lessonId?; moduleSlug? }`       | Next resource or null  |
| `getModuleProgressForUser` | query    | public | `{ moduleId?: string }`            | ModuleProgress or null |
| `get`                      | query    | public | —                                  | Lesson progress array  |
| `clear`                    | mutation | public | `{ lessons: Array<{ id; slug }> }` | void                   |

### `lessons`

| Procedure                | Type  | Auth   | Input                        | Output          |
| ------------------------ | ----- | ------ | ---------------------------- | --------------- |
| `getLessonMuxPlaybackId` | query | public | `{ lessonIdOrSlug: string }` | Mux playback ID |

### `solutions`

| Procedure         | Type     | Auth      | Input                                                              | Output           |
| ----------------- | -------- | --------- | ------------------------------------------------------------------ | ---------------- |
| `getForLesson`    | query    | protected | `{ lessonId: string }`                                             | Solution or null |
| `getAllForLesson` | query    | protected | `{ lessonId: string }`                                             | Solution array   |
| `getSolution`     | query    | protected | `{ solutionSlugOrId: string }`                                     | Solution         |
| `create`          | mutation | protected | `{ lessonId; title; body?; slug; description?; videoResourceId? }` | Created solution |
| `delete`          | mutation | protected | `{ solutionId: string }`                                           | Result           |
| `getParentLesson` | query    | protected | `{ solutionId: string }`                                           | Parent lesson    |

### `events`

| Procedure                             | Type     | Auth      | Input                                                 | Output                                          |
| ------------------------------------- | -------- | --------- | ----------------------------------------------------- | ----------------------------------------------- |
| `get`                                 | query    | public    | —                                                     | Product array with availability                 |
| `getEventReminderEmails`              | query    | public    | `{ eventId: string }`                                 | Reminder email array                            |
| `getAllReminderEmails`                | query    | public    | —                                                     | All reminder emails                             |
| `attachReminderEmailToEvent`          | mutation | protected | `{ eventId; emailId; hoursInAdvance? (default 24) }`  | Result                                          |
| `detachReminderEmailFromEvent`        | mutation | protected | `{ eventId; emailId }`                                | Result                                          |
| `createAndAttachReminderEmailToEvent` | mutation | protected | `{ eventId; input: NewEmailSchema; hoursInAdvance? }` | Result                                          |
| `updateReminderEmailHours`            | mutation | protected | `{ eventId; emailId; hoursInAdvance: 1-168 }`         | Result                                          |
| `updateReminderEmail`                 | mutation | protected | `{ emailId; eventId; hoursInAdvance; fields }`        | Updated email                                   |
| `previewReminderEmail`                | query    | protected | `{ eventId; emailId }`                                | `{ subject; body; recipientCount; recipients }` |
| `sendReminderEmailNow`                | mutation | protected | `{ eventId; emailId }`                                | `{ sent: number; errorCount: number }`          |

### `certificate`

| Procedure | Type     | Auth   | Input                                             | Output                           |
| --------- | -------- | ------ | ------------------------------------------------- | -------------------------------- |
| `upload`  | mutation | public | `{ imagePath: string; resourceIdOrSlug: string }` | Upload result                    |
| `get`     | query    | public | `{ resourceIdOrSlug: string }`                    | `{ secure_url: string }` or null |

### `convertkit`

| Procedure              | Type     | Auth   | Input                                                 | Output             |
| ---------------------- | -------- | ------ | ----------------------------------------------------- | ------------------ |
| `answerSurveyMultiple` | mutation | public | `{ answers: Record<string, any>; email?; surveyId? }` | Updated subscriber |
| `answerSurvey`         | mutation | public | `{ question; answer; surveyId? }`                     | Updated subscriber |

### `deviceVerification`

| Procedure | Type     | Auth   | Input                  | Output               |
| --------- | -------- | ------ | ---------------------- | -------------------- |
| `verify`  | mutation | public | `{ userCode: string }` | `{ status: string }` |

### `tags`

| Procedure   | Type     | Auth                   | Input       | Output      |
| ----------- | -------- | ---------------------- | ----------- | ----------- |
| `getTags`   | query    | public                 | —           | Tag array   |
| `createTag` | mutation | public (ability check) | `TagSchema` | Created tag |

### `emails`

| Procedure                 | Type     | Auth      | Input                     | Output        |
| ------------------------- | -------- | --------- | ------------------------- | ------------- |
| `getEmails`               | query    | public    | —                         | Email array   |
| `createEmail`             | mutation | protected | `NewEmailSchema`          | Email         |
| `getEmail`                | query    | public    | `string` (email ID)       | Email or null |
| `addEmailToWorkshop`      | mutation | protected | `{ workshopId; emailId }` | Result        |
| `removeEmailFromWorkshop` | mutation | protected | `{ workshopId; emailId }` | Result        |

### `imageResources`

| Procedure | Type  | Auth   | Input | Output                |
| --------- | ----- | ------ | ----- | --------------------- |
| `getAll`  | query | public | —     | Image resources array |

### `typesense`

| Procedure            | Type  | Auth   | Input                                                                                                               | Output            |
| -------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `getNearestNeighbor` | query | public | `{ documentId; numberOfNearestNeighborsToReturn? (default 5); distanceThreshold? (default 1); documentIdsToSkip? }` | Nearest neighbors |

---

## Authorization System (CASL)

### Actions

`create`, `read`, `update`, `delete`, `manage`, `view`, `save`, `publish`, `archive`, `unpublish`, `invite`, `transfer`

### Subjects

`Content`, `User`, `Organization`, `OrganizationMember`, `OrganizationBilling`, `Team`, `Invoice`, `Discord`, `Entitlement`, `RegionRestriction`, `PendingOpenAccess`, `all`

### Role-Based Rules

| Role                   | Permissions                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| **admin**              | Can `manage` all subjects                                                                 |
| **contributor**        | Can `create` Content; can `manage`, `save`, `publish`, `archive`, `unpublish` own Content |
| **reviewer**           | Can `read` Content                                                                        |
| **authenticated user** | Can `read`, `update` own User record                                                      |

### Organization Roles

| Role               | Permissions                                                                       |
| ------------------ | --------------------------------------------------------------------------------- |
| **owner**          | Full `manage` of Organization, Members, Billing; can `transfer`                   |
| **admin**          | Can `create`, `read`, `update` Organization and Members; `read`, `update` Billing |
| **member/learner** | Can `read` Organization and Members; can `delete` self from Members               |

### Entitlement-Based Access

- **workshop_content_access**: Grants `read` to specific workshop and lessons via `contentIds` metadata
- **cohort_content_access**: Grants `read` to workshop (if started) and lessons; shows `PendingOpenAccess` if not started
- **Free tier**: Grants `read` to content with `tier: 'free'` metadata

---

## Key Database Tables

### Content & Media

| Table                     | Key Columns                                                                      | Notes                      |
| ------------------------- | -------------------------------------------------------------------------------- | -------------------------- |
| `contentResource`         | `id`, `type` (post/lesson/survey/workshop/event), `fields` (JSON), `createdById` | Core content table         |
| `contentResourceResource` | `resourceOfId`, `resourceId`, `position`                                         | Parent-child relationships |
| `contentResourceTag`      | `contentResourceId`, `tagId`                                                     | Content tagging            |
| `videoResource`           | `id`, `muxPlaybackId`, `muxAssetId`, `state`, `duration`, `transcript`           | Video metadata             |
| `imageResource`           | `id`, fields                                                                     | Image metadata             |
| `tag`                     | `id`, `name`, `type`                                                             | Tags                       |

### Commerce

| Table            | Key Columns                                               | Notes                     |
| ---------------- | --------------------------------------------------------- | ------------------------- |
| `product`        | `id`, `name`, `type`, `quantityAvailable`, `status`       | Products/courses          |
| `price`          | `id`, `productId`, `unitAmount`, `nickname`               | Pricing tiers             |
| `purchase`       | `id`, `userId`, `productId`, `status`, `merchantChargeId` | Purchase records          |
| `coupon`         | `id`, `percentageDiscount`, `maxUses`, `status`           | Discount coupons          |
| `merchantCoupon` | `id`, `type` (bulk/special/ppp)                           | Merchant-specific coupons |

### Auth & Users

| Table                | Key Columns                                               | Notes                        |
| -------------------- | --------------------------------------------------------- | ---------------------------- |
| `user`               | `id`, `email`, `name`, `role`, `fields` (JSON)            | User accounts                |
| `account`            | `provider`, `providerAccountId`, `userId`, `access_token` | OAuth links                  |
| `session`            | `sessionToken`, `userId`, `expires`                       | Active sessions              |
| `deviceVerification` | `deviceCode`, `userCode`, `verifiedByUserId`, `expires`   | Device auth flow (10min TTL) |
| `deviceAccessToken`  | `token`, `userId`, `organizationMembershipId`             | Device bearer tokens         |

### Organizations & Permissions

| Table                    | Key Columns                                                        | Notes                  |
| ------------------------ | ------------------------------------------------------------------ | ---------------------- |
| `organization`           | `id`, `name`, `fields` (JSON)                                      | Organizations          |
| `organizationMembership` | `id`, `organizationId`, `userId`, `role`                           | Memberships            |
| `role`                   | `id`, `name`, `organizationId`                                     | Role definitions       |
| `permission`             | `id`, `name`                                                       | Permission definitions |
| `entitlement`            | `id`, `entitlementType`, `userId`, `sourceType`, `metadata` (JSON) | Access entitlements    |

---

## Endpoints Consumed by This Project

This project (`course-video-manager`) makes 9 API calls to the AI Hero service:

| #   | Method | Endpoint                                    | Purpose                                             |
| --- | ------ | ------------------------------------------- | --------------------------------------------------- |
| 1   | POST   | `/oauth/device/code`                        | Initiate device auth flow                           |
| 2   | POST   | `/oauth/token`                              | Poll for access token (5s intervals, 10min timeout) |
| 3   | GET    | `/oauth/userinfo`                           | Get authenticated user ID                           |
| 4   | GET    | `/api/uploads/signed-url?objectName={name}` | Get S3 signed upload URL                            |
| 5   | PUT    | `{signedUrl}`                               | Upload video to S3 (Content-Type: video/mp4)        |
| 6   | POST   | `/api/posts`                                | Create post (`{ title, postType: "article" }`)      |
| 7   | POST   | `/api/uploads/new`                          | Trigger video processing (link video to post)       |
| 8   | PUT    | `/api/posts?id={id}&action=save`            | Update post fields (title, slug, body, description) |
| 9   | PUT    | `/api/posts?id={id}&action=publish`         | Publish post                                        |

All calls (except OAuth endpoints) use `Authorization: Bearer {token}`.

**Source files:**

- `app/services/ai-hero-auth-service.ts` — OAuth device flow (calls 1-3)
- `app/services/ai-hero-upload-service.ts` — Upload & post creation (calls 4-9)
- `app/features/upload-manager/sse-ai-hero-client.ts` — SSE client for progress tracking

---

## Common Patterns

- **CORS:** Enabled on most content endpoints (allows all origins)
- **Error classes:** `PostError`, `LessonError`, `SolutionError`, `SurveyApiError` — all have `statusCode` and `details`
- **Validation:** Zod schemas for all input validation
- **Logging:** Structured logging via `@/server/logger`
- **Cache:** `revalidateTag()`/`revalidatePath()` for Next.js ISR invalidation
- **Search:** Typesense for full-text + vector similarity search
- **Background jobs:** Inngest for async processing (video uploads, webhooks, email)

## Changelog

| Date       | Change                |
| ---------- | --------------------- |
| 2026-02-25 | Initial documentation |
