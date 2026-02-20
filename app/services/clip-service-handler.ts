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

// ============================================================================
// Types
// ============================================================================

/**
 * Adapter for TotalTypeScriptCLIService functionality.
 * In production, this wraps the Effect-based service.
 * In tests, this is mocked.
 */
export interface TtCliAdapter {
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

    const clipsResult = yield* Effect.promise(() =>
      db
        .insert(clips)
        .values(
          inputClips.map((clip, index) => ({
            videoId,
            videoFilename: clip.inputVideo,
            sourceStartTime: clip.startTime,
            sourceEndTime: clip.endTime,
            order: orders[index]!,
            archived: false,
            text: "",
          }))
        )
        .returning()
    );

    return clipsResult;
  }
);

// ============================================================================
// Handler
// ============================================================================

/**
 * Handles a ClipServiceEvent by dispatching to the appropriate database operation.
 * This is the core business logic that both HTTP and direct transports use.
 *
 * @param db - Drizzle database instance
 * @param event - The event to handle
 * @param ttCli - Optional TotalTypeScriptCLI adapter (required for append-from-obs)
 */
export const handleClipServiceEvent = Effect.fn("handleClipServiceEvent")(
  function* (db: DrizzleService, event: ClipServiceEvent, ttCli: TtCliAdapter) {
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
        return yield* appendClipsAtInsertionPoint(db, event.input);
      }

      case "append-from-obs": {
        if (!ttCli) {
          throw new Error("TtCliAdapter is required for append-from-obs");
        }

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
          ttCli.getLatestOBSVideoClips({
            filePath: resolvedFilePath,
            startTime: resolvedStartTime,
          })
        );

        if (latestOBSVideoClips.clips.length === 0) {
          return [];
        }

        // Re-fetch clips for deduplication (in case they changed during CLI detection)
        const allClipsForDedup = yield* Effect.promise(() =>
          db.query.clips.findMany({
            where: eq(clips.videoId, videoId),
          })
        );

        // Filter out clips that already exist (deduplicate by videoFilename + startTime + endTime)
        const clipsToAdd = latestOBSVideoClips.clips.filter(
          (clip) =>
            !allClipsForDedup.some(
              (existingClip) =>
                existingClip.videoFilename === clip.inputVideo &&
                existingClip.sourceStartTime === clip.startTime &&
                existingClip.sourceEndTime === clip.endTime
            )
        );

        if (clipsToAdd.length === 0) {
          return [];
        }

        return yield* appendClipsAtInsertionPoint(db, {
          videoId,
          insertionPoint,
          clips: clipsToAdd,
        });
      }

      case "archive-clips": {
        for (const clipId of event.clipIds) {
          yield* Effect.promise(() =>
            db.update(clips).set({ archived: true }).where(eq(clips.id, clipId))
          );
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
        return;
      }

      case "update-beat": {
        yield* Effect.promise(() =>
          db
            .update(clips)
            .set({ beatType: event.beatType })
            .where(eq(clips.id, event.clipId))
        );
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

        return clipSection;
      }

      case "update-clip-section": {
        yield* Effect.promise(() =>
          db
            .update(clipSections)
            .set({ name: event.name })
            .where(eq(clipSections.id, event.clipSectionId))
        );
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
        return;
      }

      case "create-video-from-selection": {
        const { sourceVideoId, clipIds, clipSectionIds, title } = event.input;
        // Note: mode is used in issue #198 (move mode) - for now we only implement copy mode

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
 * @param ttCli - Optional TotalTypeScriptCLI adapter for OBS functionality
 */
export function createDirectClipService(
  db: DrizzleService,
  ttCli: TtCliAdapter
): ClipService {
  const send = (event: ClipServiceEvent): Promise<unknown> => {
    return Effect.runPromise(handleClipServiceEvent(db, event, ttCli));
  };

  return createClipService(send);
}
