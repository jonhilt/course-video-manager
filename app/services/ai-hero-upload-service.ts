import { Config, ConfigProvider, Data, Effect } from "effect";
import { statSync } from "fs";
import * as fs from "fs";
import { getAiHeroAccessToken } from "@/services/ai-hero-auth-service";

export class AiHeroUploadError extends Data.TaggedError("AiHeroUploadError")<{
  message: string;
  code?: string;
}> {}

/**
 * Step 1: Get a signed S3 URL from AI Hero for uploading the video.
 */
const getSignedUploadUrl = (opts: {
  baseUrl: string;
  accessToken: string;
  objectName: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(
        `${opts.baseUrl}/api/uploads/signed-url?objectName=${encodeURIComponent(opts.objectName)}`,
        {
          headers: {
            Authorization: `Bearer ${opts.accessToken}`,
          },
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to get signed URL (${res.status}): ${errorText}`
        );
      }

      const data = (await res.json()) as { signedUrl: string };
      return data.signedUrl;
    },
    catch: (e) =>
      new AiHeroUploadError({
        message:
          e instanceof Error ? e.message : "Failed to get signed upload URL",
        code: "signed_url_failed",
      }),
  });

/**
 * Step 2: Upload video file to S3 using the signed URL.
 * Streams the file in chunks and reports progress via onProgress callback.
 */
const uploadFileToS3 = (opts: {
  signedUrl: string;
  filePath: string;
  fileSize: number;
}) =>
  Effect.tryPromise({
    try: async () => {
      const fileBuffer = await fs.promises.readFile(opts.filePath);

      const res = await fetch(opts.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": opts.fileSize.toString(),
        },
        body: fileBuffer,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`S3 upload failed (${res.status}): ${errorText}`);
      }
    },
    catch: (e) =>
      new AiHeroUploadError({
        message: e instanceof Error ? e.message : "S3 upload failed",
        code: "s3_upload_failed",
      }),
  });

/**
 * Step 3: Create a post on AI Hero with the given title.
 * Returns the post object including its slug and id.
 */
const createPost = (opts: {
  baseUrl: string;
  accessToken: string;
  title: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`${opts.baseUrl}/api/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: opts.title,
          postType: "article",
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to create post (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as { id: string; slug: string };
      return data;
    },
    catch: (e) =>
      new AiHeroUploadError({
        message: e instanceof Error ? e.message : "Failed to create post",
        code: "create_post_failed",
      }),
  });

/**
 * Step 4: Trigger video processing on AI Hero by registering the S3 upload.
 */
const triggerVideoProcessing = (opts: {
  baseUrl: string;
  accessToken: string;
  s3Url: string;
  postId: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`${opts.baseUrl}/api/uploads/new`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: {
            url: opts.s3Url,
            name: opts.s3Url.split("/").pop() ?? "video.mp4",
          },
          metadata: {
            parentResourceId: opts.postId,
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to trigger video processing (${res.status}): ${errorText}`
        );
      }
    },
    catch: (e) =>
      new AiHeroUploadError({
        message:
          e instanceof Error ? e.message : "Failed to trigger video processing",
        code: "video_processing_failed",
      }),
  });

/**
 * Step 5: Update the post with body and description.
 */
const updatePost = (opts: {
  baseUrl: string;
  accessToken: string;
  postId: string;
  title: string;
  slug: string;
  body: string;
  description: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(
        `${opts.baseUrl}/api/posts?id=${encodeURIComponent(opts.postId)}&action=save`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${opts.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: opts.postId,
            fields: {
              title: opts.title,
              slug: opts.slug,
              body: opts.body,
              description: opts.description,
            },
            tags: [],
          }),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to update post (${res.status}): ${errorText}`);
      }
    },
    catch: (e) =>
      new AiHeroUploadError({
        message: e instanceof Error ? e.message : "Failed to update post",
        code: "update_post_failed",
      }),
  });

/**
 * Step 6: Publish the post on AI Hero.
 */
const publishPost = (opts: {
  baseUrl: string;
  accessToken: string;
  postId: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(
        `${opts.baseUrl}/api/posts?id=${encodeURIComponent(opts.postId)}&action=publish`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${opts.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to publish post (${res.status}): ${errorText}`);
      }
    },
    catch: (e) =>
      new AiHeroUploadError({
        message: e instanceof Error ? e.message : "Failed to publish post",
        code: "publish_post_failed",
      }),
  });

/**
 * Full AI Hero posting flow:
 * 1. Get signed S3 URL
 * 2. Upload video to S3 (with progress)
 * 3. Create post
 * 4. Trigger video processing
 * 5. Update post with body + description
 * 6. Publish post
 * 7. Return slug
 */
export const postToAiHero = (opts: {
  filePath: string;
  title: string;
  body: string;
  description: string;
}) =>
  Effect.gen(function* () {
    const baseUrl = yield* Config.string("AI_HERO_BASE_URL");
    const accessToken = yield* getAiHeroAccessToken;

    const fileSize = yield* Effect.try({
      try: () => statSync(opts.filePath).size,
      catch: () =>
        new AiHeroUploadError({
          message: `Video file not found: ${opts.filePath}`,
          code: "file_not_found",
        }),
    });

    // Derive object name from file path
    const objectName = opts.filePath.split("/").pop() ?? "video.mp4";

    // Step 1: Get signed S3 URL
    yield* Effect.logInfo("Getting signed S3 URL from AI Hero");
    const signedUrl = yield* getSignedUploadUrl({
      baseUrl,
      accessToken,
      objectName,
    });

    // Step 2: Upload video to S3
    yield* Effect.logInfo("Uploading video to S3");
    yield* uploadFileToS3({
      signedUrl,
      filePath: opts.filePath,
      fileSize,
    });

    // Step 3: Create post
    yield* Effect.logInfo("Creating post on AI Hero");
    const post = yield* createPost({
      baseUrl,
      accessToken,
      title: opts.title,
    });

    // Step 4: Trigger video processing
    // Send the full signed URL (not stripped) so Mux can download from private S3
    yield* Effect.logInfo("Triggering video processing");
    yield* triggerVideoProcessing({
      baseUrl,
      accessToken,
      s3Url: signedUrl,
      postId: post.id,
    });

    // Step 5: Update post with body and description
    yield* Effect.logInfo("Updating post with body and description");
    yield* updatePost({
      baseUrl,
      accessToken,
      postId: post.id,
      title: opts.title,
      slug: post.slug,
      body: opts.body,
      description: opts.description,
    });

    // Step 6: Publish post
    yield* Effect.logInfo("Publishing post");
    yield* publishPost({
      baseUrl,
      accessToken,
      postId: post.id,
    });

    yield* Effect.logInfo(`AI Hero post published. Slug: ${post.slug}`);

    return { slug: post.slug };
  }).pipe(Effect.withConfigProvider(ConfigProvider.fromEnv()));
