/**
 * ClipService Handler
 *
 * This file contains the handler function that processes ClipServiceEvents
 * and the direct transport factory for testing.
 *
 * The handler pattern-matches on the event type and dispatches to the
 * appropriate database operations.
 */

import { clips, clipSections, videos } from "@/db/schema";
import { compareOrderStrings } from "@/lib/sort-by-order";
import { and, asc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { generateNKeysBetween } from "fractional-indexing";
import {
  createClipService,
  type ClipService,
  type ClipServiceEvent,
  type TimelineItem,
} from "./clip-service";
import type { DrizzleService } from "./drizzle-service";
import type { LogEvent } from "./video-editor-logger-service";

// ============================================================================
// Types
// ============================================================================

/**
 * Adapter for VideoProcessingService functionality.
 * In production, this wraps the Effect-based service.
 * In tests, this is mocked.
 */
export interface VideoProcessingAdapter {
  getLatestOBSVideoClips: (opts: {
    filePath: string | undefined;
    startTime: number | undefined;
  }) => Promise<{
    readonly clips: ReadonlyArray<{
      readonly inputVideo: string;
      readonly startTime: number;
      readonly endTime: number;
    }>;
  }>;
}

/**
 * Adapter for VideoEditorLoggerService.
 * In production, wraps the Effect-based logger service.
 * In tests, can be a no-op.
 */
export interface LoggerAdapter {
  log: (videoId: string, event: LogEvent) => void;
}

const noopLogger: LoggerAdapter = { log: () => {} };

// ============================================================================
// Helper: Windows to WSL path conversion
// ============================================================================

function windowsToWSL(windowsPath: string): string {
  // Convert C:\Users\... to /mnt/c/Users/...
  const drive = windowsPath.charAt(0).toLowerCase();
  const pathWithoutDrive = windowsPath.slice(3); // Remove "C:\"

  // Convert backslashes to forward slashes
  const unixPath = pathWithoutDrive.replace(/\\/g, "/");

  return `/mnt/${drive}/${unixPath}`;
}

// ============================================================================
// Helper: Get all items for a video sorted by order
// ============================================================================

const getOrderedItems = Effect.fn("getOrderedItems")(function* (
  db: DrizzleService,
  videoId: string
) {
  const allClips = yield* Effect.promise(() =>
    db.query.clips.findMany({
      where: and(eq(clips.videoId, videoId), eq(clips.archived, false)),
      orderBy: asc(clips.order),
    })
  );

  const allClipSections = yield* Effect.promise(() =>
    db.query.clipSections.findMany({
      where: and(
        eq(clipSections.videoId, videoId),
        eq(clipSections.archived, false)
      ),
      orderBy: asc(clipSections.order),
    })
  );

  const allItems = [
    ...allClips.map((c) => ({ type: "clip" as const, ...c })),
    ...allClipSections.map((cs) => ({
      type: "clip-section" as const,
      ...cs,
    })),
  ].sort((a, b) => compareOrderStrings(a.order, b.order));

  return allItems;
});

// ============================================================================
// Helper: Append clips at an insertion point
// ============================================================================

const appendClipsAtInsertionPoint = Effect.fn("appendClipsAtInsertionPoint")(
  function* (
    db: DrizzleService,
    input: Extract<ClipServiceEvent, { type: "append-clips" }>["input"]
  ) {
    const { videoId, insertionPoint, clips: inputClips } = input;
    const allItems = yield* getOrderedItems(db, videoId);

    let prevOrder: string | null = null;
    let nextOrder: string | null = null;

    if (insertionPoint.type === "start") {
      const firstItem = allItems[0];
      nextOrder = firstItem?.order ?? null;
    } else if (insertionPoint.type === "after-clip") {
      const insertAfterClipIndex = allItems.findIndex(
        (item) =>
          item.type === "clip" && item.id === insertionPoint.databaseClipId
      );

      if (insertAfterClipIndex === -1) {
        throw new Error(
          `Could not find a clip to insert after: ${insertionPoint.databaseClipId}`
        );
      }

      const insertAfterItem = allItems[insertAfterClipIndex];
      prevOrder = insertAfterItem?.order ?? null;

      const nextItem = allItems[insertAfterClipIndex + 1];
      nextOrder = nextItem?.order ?? null;
    } else if (insertionPoint.type === "after-clip-section") {
      const insertAfterSectionIndex = allItems.findIndex(
        (item) =>
          item.type === "clip-section" &&
          item.id === insertionPoint.clipSectionId
      );

      if (insertAfterSectionIndex === -1) {
        throw new Error(
          `Could not find a clip section to insert after: ${insertionPoint.clipSectionId}`
        );
      }

      const insertAfterItem = allItems[insertAfterSectionIndex];
      prevOrder = insertAfterItem?.order ?? null;

      const nextItem = allItems[insertAfterSectionIndex + 1];
      nextOrder = nextItem?.order ?? null;
    }

    const orders = generateNKeysBetween(
      prevOrder,
      nextOrder,
      inputClips.length
    );

    const insertValues = inputClips.map((clip, index) => ({
      videoId,
      videoFilename: clip.inputVideo,
      sourceStartTime: clip.startTime,
      sourceEndTime: clip.endTime,
      order: orders[index]!,
      archived: false,
      text: "",
    }));

    const clipsResult = yield* Effect.promise(() =>
      db.insert(clips).values(insertValues).returning()
    );

    return clipsResult;
  }
);

// ============================================================================
// Mutex: Serialize append-from-obs calls per videoId
// ============================================================================

const videoMutexes = new Map<string, Promise<void>>();

async function withVideoMutex<T>(
  videoId: string,
  fn: () => Promise<T>
): Promise<T> {
  const prior = videoMutexes.get(videoId) ?? Promise.resolve();

  let releaseMutex: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseMutex = resolve;
  });
  videoMutexes.set(videoId, gate);

  try {
    await prior;
    return await fn();
  } finally {
    releaseMutex!();
    if (videoMutexes.get(videoId) === gate) {
      videoMutexes.delete(videoId);
    }
  }
}

// ============================================================================
// Helper: append-from-obs implementation (runs inside mutex)
// ============================================================================

const appendFromObsImpl = (
  db: DrizzleService,
  event: Extract<ClipServiceEvent, { type: "append-from-obs" }>,
  videoProcessing: VideoProcessingAdapter,
  logger: LoggerAdapter
) =>
  Effect.gen(function* () {
    const { videoId, filePath, insertionPoint } = event.input;

    // Convert Windows path to WSL path if provided
    const resolvedFilePath = filePath ? windowsToWSL(filePath) : undefined;

    // Get all clips (including archived) to find the last clip with this input video
    const allClipsIncludingArchived = yield* Effect.promise(() =>
      db.query.clips.findMany({
        where: eq(clips.videoId, videoId),
      })
    );

    // Find clips with this input video and get the one with the latest end time
    const clipsWithThisInputVideo = allClipsIncludingArchived
      .filter((clip) => clip.videoFilename === resolvedFilePath)
      .sort((a, b) => b.sourceStartTime - a.sourceStartTime);

    const lastClipWithThisInputVideo = clipsWithThisInputVideo[0];

    // Calculate start time: end time of last clip - 1 second for silence gap
    const resolvedStartTime =
      typeof lastClipWithThisInputVideo?.sourceEndTime === "number"
        ? Math.max(lastClipWithThisInputVideo.sourceEndTime - 1, 0)
        : undefined;

    // Call CLI to detect clips
    const latestOBSVideoClips = yield* Effect.promise(() =>
      videoProcessing.getLatestOBSVideoClips({
        filePath: resolvedFilePath,
        startTime: resolvedStartTime,
      })
    );

    if (latestOBSVideoClips.clips.length === 0) {
      logger.log(videoId, {
        type: "clips-appended-from-obs",
        videoId,
        detected: 0,
        duplicatesSkipped: 0,
        inserted: 0,
        clips: [],
      });
      return [];
    }

    // Re-fetch clips for deduplication (in case they changed during CLI detection)
    const allClipsForDedup = yield* Effect.promise(() =>
      db.query.clips.findMany({
        where: eq(clips.videoId, videoId),
      })
    );

    // Filter out clips that already exist (deduplicate by videoFilename + startTime + endTime)
    // Uses a tolerance of 0.15s to account for floating-point rounding from OBS detection
    const DEDUP_TOLERANCE_SECONDS = 0.15;
    const clipsToAdd = latestOBSVideoClips.clips.filter(
      (clip) =>
        !allClipsForDedup.some(
          (existingClip) =>
            existingClip.videoFilename === clip.inputVideo &&
            Math.abs(existingClip.sourceStartTime - clip.startTime) <
              DEDUP_TOLERANCE_SECONDS &&
            Math.abs(existingClip.sourceEndTime - clip.endTime) <
              DEDUP_TOLERANCE_SECONDS
        )
    );

    if (clipsToAdd.length === 0) {
      logger.log(videoId, {
        type: "clips-appended-from-obs",
        videoId,
        detected: latestOBSVideoClips.clips.length,
        duplicatesSkipped: latestOBSVideoClips.clips.length,
        inserted: 0,
        clips: [],
      });
      return [];
    }

    const result = yield* appendClipsAtInsertionPoint(db, {
      videoId,
      insertionPoint,
      clips: clipsToAdd,
    });

    const totalDuplicatesSkipped =
      latestOBSVideoClips.clips.length - result.length;

    logger.log(videoId, {
      type: "clips-appended-from-obs",
      videoId,
      detected: latestOBSVideoClips.clips.length,
      duplicatesSkipped: totalDuplicatesSkipped,
      inserted: result.length,
      clips: result.map((c) => ({
        inputVideo: c.videoFilename,
        startTime: c.sourceStartTime,
        endTime: c.sourceEndTime,
      })),
    });

    return result;
  });

// ============================================================================
// Handler
// ============================================================================

/**
 * Handles a ClipServiceEvent by dispatching to the appropriate database operation.
 * This is the core business logic that both HTTP and direct transports use.
 *
 * @param db - Drizzle database instance
 * @param event - The event to handle
 * @param videoProcessing - VideoProcessingService adapter (required for append-from-obs)
 */
export const handleClipServiceEvent = Effect.fn("handleClipServiceEvent")(
  function* (
    db: DrizzleService,
    event: ClipServiceEvent,
    videoProcessing: VideoProcessingAdapter,
    logger: LoggerAdapter = noopLogger
  ) {
    switch (event.type) {
      case "create-video": {
        const [video] = yield* Effect.promise(() =>
          db
            .insert(videos)
            .values({
              path: event.path,
              originalFootagePath: "",
              lessonId: null,
            })
            .returning()
        );

        if (!video) {
          throw new Error("Failed to create video");
        }

        return video;
      }

      case "get-timeline": {
        const allItems = yield* getOrderedItems(db, event.videoId);

        const timeline: TimelineItem[] = allItems.map((item) => {
          if (item.type === "clip") {
            const { type, ...clipData } = item;
            return { type: "clip", data: clipData };
          } else {
            const { type, ...sectionData } = item;
            return { type: "clip-section", data: sectionData };
          }
        });

        return timeline;
      }

      case "append-clips": {
        const result = yield* appendClipsAtInsertionPoint(db, event.input);

        logger.log(event.input.videoId, {
          type: "clips-appended",
          videoId: event.input.videoId,
          insertionPoint: event.input.insertionPoint,
          clips: event.input.clips.map((c) => ({
            inputVideo: c.inputVideo,
            startTime: c.startTime,
            endTime: c.endTime,
          })),
          generatedOrders: result.map((c) => c.order),
        });

        return result;
      }

      case "append-from-obs": {
        if (!videoProcessing) {
          throw new Error(
            "VideoProcessingAdapter is required for append-from-obs"
          );
        }

        // Serialize concurrent append-from-obs calls for the same video
        // via an in-memory mutex to prevent duplicate clip inserts
        return yield* Effect.promise(() =>
          withVideoMutex(event.input.videoId, () =>
            Effect.runPromise(
              appendFromObsImpl(db, event, videoProcessing, logger)
            )
          )
        );
      }

      case "archive-clips": {
        for (const clipId of event.clipIds) {
          yield* Effect.promise(() =>
            db.update(clips).set({ archived: true }).where(eq(clips.id, clipId))
          );
        }

        // We need the videoId for logging — look up from first clip
        if (event.clipIds.length > 0) {
          const firstClip = yield* Effect.promise(() =>
            db.query.clips.findFirst({
              where: eq(clips.id, event.clipIds[0]!),
            })
          );
          if (firstClip) {
            logger.log(firstClip.videoId, {
              type: "clips-archived",
              clipIds: [...event.clipIds],
            });
          }
        }
        return;
      }

      case "update-clips": {
        for (const clip of event.clips) {
          yield* Effect.promise(() =>
            db
              .update(clips)
              .set({
                scene: clip.scene,
                profile: clip.profile,
                beatType: clip.beatType,
              })
              .where(eq(clips.id, clip.id))
          );
        }

        if (event.clips.length > 0) {
          const firstClip = yield* Effect.promise(() =>
            db.query.clips.findFirst({
              where: eq(clips.id, event.clips[0]!.id),
            })
          );
          if (firstClip) {
            logger.log(firstClip.videoId, {
              type: "clips-updated",
              clips: event.clips.map((c) => ({
                id: c.id,
                scene: c.scene,
                profile: c.profile,
                beatType: c.beatType,
              })),
            });
          }
        }
        return;
      }

      case "update-beat": {
        yield* Effect.promise(() =>
          db
            .update(clips)
            .set({ beatType: event.beatType })
            .where(eq(clips.id, event.clipId))
        );

        const clip = yield* Effect.promise(() =>
          db.query.clips.findFirst({
            where: eq(clips.id, event.clipId),
          })
        );
        if (clip) {
          logger.log(clip.videoId, {
            type: "beat-updated",
            clipId: event.clipId,
            beatType: event.beatType,
          });
        }
        return;
      }

      case "reorder-clip": {
        const clip = yield* Effect.promise(() =>
          db.query.clips.findFirst({
            where: eq(clips.id, event.clipId),
          })
        );

        if (!clip) {
          throw new Error(`Clip not found: ${event.clipId}`);
        }

        const allItems = yield* getOrderedItems(db, clip.videoId);

        const itemIndex = allItems.findIndex(
          (item) => item.type === "clip" && item.id === event.clipId
        );
        const targetIndex =
          event.direction === "up" ? itemIndex - 1 : itemIndex + 1;

        if (targetIndex < 0 || targetIndex >= allItems.length) {
          return;
        }

        let newOrder: string;
        if (event.direction === "up") {
          const prevItem = allItems[targetIndex - 1];
          const nextItem = allItems[targetIndex];
          const prevOrder = prevItem?.order ?? null;
          const nextOrder = nextItem!.order;
          const [order] = generateNKeysBetween(prevOrder, nextOrder, 1);
          newOrder = order!;
        } else {
          const prevItem = allItems[targetIndex];
          const nextItem = allItems[targetIndex + 1];
          const prevOrder = prevItem!.order;
          const nextOrder = nextItem?.order ?? null;
          const [order] = generateNKeysBetween(prevOrder, nextOrder, 1);
          newOrder = order!;
        }

        yield* Effect.promise(() =>
          db
            .update(clips)
            .set({ order: newOrder })
            .where(eq(clips.id, event.clipId))
        );

        logger.log(clip.videoId, {
          type: "clip-reordered",
          clipId: event.clipId,
          direction: event.direction,
        });
        return;
      }

      case "create-clip-section-at-insertion-point": {
        const { videoId, name, insertionPoint } = event.input;
        const allItems = yield* getOrderedItems(db, videoId);

        let prevOrder: string | null = null;
        let nextOrder: string | null = null;

        if (insertionPoint.type === "start") {
          const firstItem = allItems[0];
          nextOrder = firstItem?.order ?? null;
        } else if (insertionPoint.type === "after-clip") {
          const insertAfterClipIndex = allItems.findIndex(
            (item) =>
              item.type === "clip" && item.id === insertionPoint.databaseClipId
          );

          if (insertAfterClipIndex === -1) {
            throw new Error(
              `Could not find a clip to insert after: ${insertionPoint.databaseClipId}`
            );
          }

          const insertAfterItem = allItems[insertAfterClipIndex];
          prevOrder = insertAfterItem?.order ?? null;

          const nextItem = allItems[insertAfterClipIndex + 1];
          nextOrder = nextItem?.order ?? null;
        } else if (insertionPoint.type === "after-clip-section") {
          const insertAfterSectionIndex = allItems.findIndex(
            (item) =>
              item.type === "clip-section" &&
              item.id === insertionPoint.clipSectionId
          );

          if (insertAfterSectionIndex === -1) {
            throw new Error(
              `Could not find a clip section to insert after: ${insertionPoint.clipSectionId}`
            );
          }

          const insertAfterItem = allItems[insertAfterSectionIndex];
          prevOrder = insertAfterItem?.order ?? null;

          const nextItem = allItems[insertAfterSectionIndex + 1];
          nextOrder = nextItem?.order ?? null;
        }

        const [order] = generateNKeysBetween(prevOrder, nextOrder, 1);

        const [clipSection] = yield* Effect.promise(() =>
          db
            .insert(clipSections)
            .values({
              videoId,
              name,
              order: order!,
              archived: false,
            })
            .returning()
        );

        if (!clipSection) {
          throw new Error("Failed to create clip section");
        }

        logger.log(videoId, {
          type: "clip-section-created",
          sectionId: clipSection.id,
          name,
          order: order!,
        });

        return clipSection;
      }

      case "create-clip-section-at-position": {
        const { videoId, name, position, targetItemId, targetItemType } =
          event.input;
        const allItems = yield* getOrderedItems(db, videoId);

        const targetIndex = allItems.findIndex(
          (item) => item.type === targetItemType && item.id === targetItemId
        );

        if (targetIndex === -1) {
          throw new Error(
            `Could not find target ${targetItemType}: ${targetItemId}`
          );
        }

        let prevOrder: string | null = null;
        let nextOrder: string | null = null;

        if (position === "before") {
          nextOrder = allItems[targetIndex]?.order ?? null;
          const prevItem = allItems[targetIndex - 1];
          prevOrder = prevItem?.order ?? null;
        } else {
          prevOrder = allItems[targetIndex]?.order ?? null;
          const nextItem = allItems[targetIndex + 1];
          nextOrder = nextItem?.order ?? null;
        }

        const [order] = generateNKeysBetween(prevOrder, nextOrder, 1);

        const [clipSection] = yield* Effect.promise(() =>
          db
            .insert(clipSections)
            .values({
              videoId,
              name,
              order: order!,
              archived: false,
            })
            .returning()
        );

        if (!clipSection) {
          throw new Error("Failed to create clip section");
        }

        logger.log(videoId, {
          type: "clip-section-created",
          sectionId: clipSection.id,
          name,
          order: order!,
        });

        return clipSection;
      }

      case "update-clip-section": {
        yield* Effect.promise(() =>
          db
            .update(clipSections)
            .set({ name: event.name })
            .where(eq(clipSections.id, event.clipSectionId))
        );

        const section = yield* Effect.promise(() =>
          db.query.clipSections.findFirst({
            where: eq(clipSections.id, event.clipSectionId),
          })
        );
        if (section) {
          logger.log(section.videoId, {
            type: "clip-section-updated",
            clipSectionId: event.clipSectionId,
            name: event.name,
          });
        }
        return;
      }

      case "archive-clip-sections": {
        for (const clipSectionId of event.clipSectionIds) {
          yield* Effect.promise(() =>
            db
              .update(clipSections)
              .set({ archived: true })
              .where(eq(clipSections.id, clipSectionId))
          );
        }

        if (event.clipSectionIds.length > 0) {
          const firstSection = yield* Effect.promise(() =>
            db.query.clipSections.findFirst({
              where: eq(clipSections.id, event.clipSectionIds[0]!),
            })
          );
          if (firstSection) {
            logger.log(firstSection.videoId, {
              type: "clip-sections-archived",
              clipSectionIds: [...event.clipSectionIds],
            });
          }
        }
        return;
      }

      case "reorder-clip-section": {
        const clipSection = yield* Effect.promise(() =>
          db.query.clipSections.findFirst({
            where: eq(clipSections.id, event.clipSectionId),
          })
        );

        if (!clipSection) {
          throw new Error(`Clip section not found: ${event.clipSectionId}`);
        }

        const allItems = yield* getOrderedItems(db, clipSection.videoId);

        const itemIndex = allItems.findIndex(
          (item) =>
            item.type === "clip-section" && item.id === event.clipSectionId
        );
        const targetIndex =
          event.direction === "up" ? itemIndex - 1 : itemIndex + 1;

        if (targetIndex < 0 || targetIndex >= allItems.length) {
          return;
        }

        let newOrder: string;
        if (event.direction === "up") {
          const prevItem = allItems[targetIndex - 1];
          const nextItem = allItems[targetIndex];
          const prevOrder = prevItem?.order ?? null;
          const nextOrder = nextItem!.order;
          const [order] = generateNKeysBetween(prevOrder, nextOrder, 1);
          newOrder = order!;
        } else {
          const prevItem = allItems[targetIndex];
          const nextItem = allItems[targetIndex + 1];
          const prevOrder = prevItem!.order;
          const nextOrder = nextItem?.order ?? null;
          const [order] = generateNKeysBetween(prevOrder, nextOrder, 1);
          newOrder = order!;
        }

        yield* Effect.promise(() =>
          db
            .update(clipSections)
            .set({ order: newOrder })
            .where(eq(clipSections.id, event.clipSectionId))
        );

        logger.log(clipSection.videoId, {
          type: "clip-section-reordered",
          clipSectionId: event.clipSectionId,
          direction: event.direction,
        });
        return;
      }

      case "create-video-from-selection": {
        const { sourceVideoId, clipIds, clipSectionIds, title, mode } =
          event.input;

        // Get the source video to inherit lessonId
        const sourceVideo = yield* Effect.promise(() =>
          db.query.videos.findFirst({
            where: eq(videos.id, sourceVideoId),
          })
        );

        if (!sourceVideo) {
          throw new Error(`Source video not found: ${sourceVideoId}`);
        }

        // Create the new video
        const [newVideo] = yield* Effect.promise(() =>
          db
            .insert(videos)
            .values({
              path: title,
              originalFootagePath: title,
              lessonId: sourceVideo.lessonId,
            })
            .returning()
        );

        if (!newVideo) {
          throw new Error("Failed to create new video");
        }

        // Get all items from source video to determine their relative order
        const allItems = yield* getOrderedItems(db, sourceVideoId);

        // Build sets for quick lookup
        const selectedClipIds = new Set(clipIds);
        const selectedSectionIds = new Set(clipSectionIds);

        // Filter to only selected items, preserving original timeline order
        const selectedItems = allItems.filter((item) => {
          if (item.type === "clip") {
            return selectedClipIds.has(item.id);
          } else {
            return selectedSectionIds.has(item.id);
          }
        });

        // Generate fresh order keys for the new video
        const orders = generateNKeysBetween(null, null, selectedItems.length);

        // Copy each selected item to the new video
        for (let i = 0; i < selectedItems.length; i++) {
          const item = selectedItems[i]!;
          const order = orders[i]!;

          if (item.type === "clip") {
            yield* Effect.promise(() =>
              db.insert(clips).values({
                videoId: newVideo.id,
                videoFilename: item.videoFilename,
                sourceStartTime: item.sourceStartTime,
                sourceEndTime: item.sourceEndTime,
                order,
                archived: false,
                text: item.text,
                transcribedAt: item.transcribedAt,
                scene: item.scene,
                profile: item.profile,
                beatType: item.beatType,
              })
            );
          } else {
            yield* Effect.promise(() =>
              db.insert(clipSections).values({
                videoId: newVideo.id,
                name: item.name,
                order,
                archived: false,
              })
            );
          }
        }

        // In move mode, archive the originals from the source video
        if (mode === "move") {
          for (const clipId of clipIds) {
            yield* Effect.promise(() =>
              db
                .update(clips)
                .set({ archived: true })
                .where(eq(clips.id, clipId))
            );
          }

          for (const clipSectionId of clipSectionIds) {
            yield* Effect.promise(() =>
              db
                .update(clipSections)
                .set({ archived: true })
                .where(eq(clipSections.id, clipSectionId))
            );
          }
        }

        logger.log(sourceVideoId, {
          type: "video-created-from-selection",
          sourceVideoId,
          clipIds: [...clipIds],
          newVideoId: newVideo.id,
        });

        return newVideo;
      }

      default: {
        const _exhaustive: never = event;
        throw new Error(`Unknown event type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
);

// ============================================================================
// Direct Transport Factory (for tests)
// ============================================================================

/**
 * Creates a ClipService that calls the handler directly with the provided
 * database instance. Used for testing with PGlite.
 *
 * @param db - Drizzle database instance
 * @param videoProcessing - VideoProcessingService adapter for OBS functionality
 */
export function createDirectClipService(
  db: DrizzleService,
  videoProcessing: VideoProcessingAdapter,
  logger?: LoggerAdapter
): ClipService {
  const send = (event: ClipServiceEvent): Promise<unknown> => {
    return Effect.runPromise(
      handleClipServiceEvent(db, event, videoProcessing, logger ?? noopLogger)
    );
  };

  return createClipService(send);
}
