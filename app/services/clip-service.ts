/**
 * ClipService - Deep module with RPC transport for clip operations
 *
 * This service provides a simple, typed, Promise-based interface for all clip
 * and clip-section operations. The frontend calls typed methods, and internally
 * these are dispatched through an RPC-style transport.
 *
 * Two transports are available:
 * - HTTP transport (production): Single fetch to /clip-service route
 * - Direct transport (tests): Calls handler directly with PGlite
 */

import type { InferSelectModel } from "drizzle-orm";
import type { clips, clipSections, videos } from "@/db/schema";
import { Schema } from "effect";

// ============================================================================
// Database Types
// ============================================================================

export type Clip = InferSelectModel<typeof clips>;
export type ClipSection = InferSelectModel<typeof clipSections>;
export type Video = InferSelectModel<typeof videos>;

// ============================================================================
// Insertion Point Types
// ============================================================================

/**
 * Insertion point for clips - where to insert in the timeline.
 * Used by appendClips and createClipSectionAtInsertionPoint.
 */
export type InsertionPoint =
  | { type: "start" }
  | { type: "after-clip"; databaseClipId: string }
  | { type: "after-clip-section"; clipSectionId: string };

/**
 * Position for creating clip sections relative to a target item.
 * Used by createClipSectionAtPosition.
 */
export type Position = "before" | "after";
export type TargetItemType = "clip" | "clip-section";

// ============================================================================
// Timeline Types
// ============================================================================

/**
 * Unified timeline item - either a clip or a clip section.
 * Returned by getTimeline, sorted by order.
 */
export type TimelineItem =
  | { type: "clip"; data: Clip }
  | { type: "clip-section"; data: ClipSection };

// ============================================================================
// Direction Types
// ============================================================================

export type ReorderDirection = "up" | "down";

// ============================================================================
// Frontend Insertion Point Types (for toDatabaseInsertionPoint)
// ============================================================================

/**
 * Branded string types for frontend vs database IDs.
 * Frontend IDs are temporary (UUID generated on the client).
 * Database IDs come from the database after persistence.
 */
export type FrontendId = string & { readonly __brand: "FrontendId" };
export type DatabaseId = string & { readonly __brand: "DatabaseId" };

/**
 * Frontend insertion point - uses frontend IDs.
 * Used by the video editor reducer to track where new clips should go.
 */
export type FrontendInsertionPoint =
  | { type: "start" }
  | { type: "after-clip"; frontendClipId: FrontendId }
  | { type: "after-clip-section"; frontendClipSectionId: FrontendId }
  | { type: "end" };

/**
 * Frontend timeline item types - items can be optimistic (not yet persisted)
 * or on-database (already saved).
 */
export type FrontendTimelineItem =
  | { type: "on-database"; frontendId: FrontendId; databaseId: DatabaseId }
  | { type: "optimistically-added"; frontendId: FrontendId }
  | {
      type: "clip-section-on-database";
      frontendId: FrontendId;
      databaseId: DatabaseId;
    }
  | { type: "clip-section-optimistically-added"; frontendId: FrontendId };

/**
 * API insertion point with branded database IDs.
 * This is the return type of toDatabaseInsertionPoint.
 */
export type ApiInsertionPoint =
  | { type: "start" }
  | { type: "after-clip"; databaseClipId: DatabaseId }
  | { type: "after-clip-section"; clipSectionId: DatabaseId };

/**
 * Converts a frontend insertion point to a database insertion point.
 * This resolves optimistic items to their nearest persisted ancestor.
 *
 * @param insertionPoint - The frontend insertion point (may reference optimistic items)
 * @param items - The current frontend timeline items
 * @returns An ApiInsertionPoint with branded database IDs
 */
export const toDatabaseInsertionPoint = (
  insertionPoint: FrontendInsertionPoint,
  items: FrontendTimelineItem[]
): ApiInsertionPoint => {
  if (insertionPoint.type === "start") {
    return { type: "start" };
  }

  if (insertionPoint.type === "after-clip") {
    const frontendClipIndex = items.findIndex(
      (c) => c.frontendId === insertionPoint.frontendClipId
    );
    if (frontendClipIndex === -1) {
      throw new Error("Clip not found");
    }

    const previousPersistedItem = items
      .slice(0, frontendClipIndex + 1)
      .findLast(
        (c) => c.type === "on-database" || c.type === "clip-section-on-database"
      );

    if (!previousPersistedItem) {
      return { type: "start" };
    }

    if (previousPersistedItem.type === "clip-section-on-database") {
      return {
        type: "after-clip-section",
        clipSectionId: previousPersistedItem.databaseId,
      };
    }

    return {
      type: "after-clip",
      databaseClipId: previousPersistedItem.databaseId,
    };
  }

  if (insertionPoint.type === "after-clip-section") {
    const frontendClipSectionIndex = items.findIndex(
      (c) => c.frontendId === insertionPoint.frontendClipSectionId
    );
    if (frontendClipSectionIndex === -1) {
      throw new Error("Clip section not found");
    }

    const section = items[frontendClipSectionIndex]!;

    // If the section is persisted, use the new after-clip-section API type
    if (section.type === "clip-section-on-database") {
      return {
        type: "after-clip-section",
        clipSectionId: section.databaseId,
      };
    }

    // Optimistic section (no DB ID yet) — fall back to last persisted item before it
    const previousPersistedItem = items
      .slice(0, frontendClipSectionIndex + 1)
      .findLast(
        (c) => c.type === "on-database" || c.type === "clip-section-on-database"
      );

    if (!previousPersistedItem) {
      return { type: "start" };
    }

    if (previousPersistedItem.type === "clip-section-on-database") {
      return {
        type: "after-clip-section",
        clipSectionId: previousPersistedItem.databaseId,
      };
    }

    return {
      type: "after-clip",
      databaseClipId: previousPersistedItem.databaseId,
    };
  }

  if (insertionPoint.type === "end") {
    // Find the last persisted item (clip or section)
    const lastPersistedItem = items.findLast(
      (c) => c.type === "on-database" || c.type === "clip-section-on-database"
    );

    if (!lastPersistedItem) {
      return { type: "start" };
    }

    if (lastPersistedItem.type === "clip-section-on-database") {
      return {
        type: "after-clip-section",
        clipSectionId: lastPersistedItem.databaseId,
      };
    }

    return {
      type: "after-clip",
      databaseClipId: lastPersistedItem.databaseId,
    };
  }

  throw new Error("Invalid insertion point");
};

// ============================================================================
// Input Types for Methods
// ============================================================================

export interface AppendClipsInput {
  videoId: string;
  insertionPoint: InsertionPoint;
  clips: readonly {
    inputVideo: string;
    startTime: number;
    endTime: number;
  }[];
}

export interface AppendFromObsInput {
  videoId: string;
  filePath?: string;
  insertionPoint: InsertionPoint;
}

export interface UpdateClipInput {
  id: string;
  scene: string;
  profile: string;
  beatType: string;
}

export interface CreateClipSectionAtInsertionPointInput {
  videoId: string;
  name: string;
  insertionPoint: InsertionPoint;
}

export interface CreateClipSectionAtPositionInput {
  videoId: string;
  name: string;
  position: Position;
  targetItemId: string;
  targetItemType: TargetItemType;
}

// ============================================================================
// ClipService Interface
// ============================================================================

/**
 * The main ClipService interface. All methods return Promises.
 * No Effect.ts types are exposed to consumers.
 */
export interface ClipService {
  // Video fixture (primarily for tests)
  createVideo(path: string): Promise<Video>;

  // Timeline
  getTimeline(videoId: string): Promise<TimelineItem[]>;

  // Clip operations
  appendClips(input: AppendClipsInput): Promise<Clip[]>;
  appendFromObs(input: AppendFromObsInput): Promise<Clip[]>;
  archiveClips(clipIds: string[]): Promise<void>;
  updateClips(clips: UpdateClipInput[]): Promise<void>;
  updateBeat(clipId: string, beatType: string): Promise<void>;
  reorderClip(clipId: string, direction: ReorderDirection): Promise<void>;

  // Clip section operations
  createClipSectionAtInsertionPoint(
    input: CreateClipSectionAtInsertionPointInput
  ): Promise<ClipSection>;
  createClipSectionAtPosition(
    input: CreateClipSectionAtPositionInput
  ): Promise<ClipSection>;
  updateClipSection(clipSectionId: string, name: string): Promise<void>;
  archiveClipSections(clipSectionIds: string[]): Promise<void>;
  reorderClipSection(
    clipSectionId: string,
    direction: ReorderDirection
  ): Promise<void>;
}

// ============================================================================
// RPC Event Types (Internal)
// ============================================================================

/**
 * Discriminated union of all ClipService operations.
 * This is an internal implementation detail - not exported to consumers.
 */
export type ClipServiceEvent =
  | { type: "create-video"; path: string }
  | { type: "get-timeline"; videoId: string }
  | { type: "append-clips"; input: AppendClipsInput }
  | { type: "append-from-obs"; input: AppendFromObsInput }
  | { type: "archive-clips"; clipIds: readonly string[] }
  | { type: "update-clips"; clips: readonly UpdateClipInput[] }
  | { type: "update-beat"; clipId: string; beatType: string }
  | { type: "reorder-clip"; clipId: string; direction: ReorderDirection }
  | {
      type: "create-clip-section-at-insertion-point";
      input: CreateClipSectionAtInsertionPointInput;
    }
  | {
      type: "create-clip-section-at-position";
      input: CreateClipSectionAtPositionInput;
    }
  | { type: "update-clip-section"; clipSectionId: string; name: string }
  | { type: "archive-clip-sections"; clipSectionIds: readonly string[] }
  | {
      type: "reorder-clip-section";
      clipSectionId: string;
      direction: ReorderDirection;
    };

// ============================================================================
// Transport Type
// ============================================================================

/**
 * Transport function signature. Takes an event, returns a Promise of the result.
 * HTTP transport sends to /clip-service route.
 * Direct transport calls handler directly.
 */
export type ClipServiceTransport = (
  event: ClipServiceEvent
) => Promise<unknown>;

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a ClipService instance using the provided transport.
 * This is the internal factory - consumers use createHttpClipService() or
 * createDirectClipService() instead.
 */
export function createClipService(send: ClipServiceTransport): ClipService {
  return {
    async createVideo(path) {
      return send({ type: "create-video", path }) as Promise<Video>;
    },

    async getTimeline(videoId) {
      return send({ type: "get-timeline", videoId }) as Promise<TimelineItem[]>;
    },

    async appendClips(input) {
      return send({ type: "append-clips", input }) as Promise<Clip[]>;
    },

    async appendFromObs(input) {
      return send({ type: "append-from-obs", input }) as Promise<Clip[]>;
    },

    async archiveClips(clipIds) {
      await send({ type: "archive-clips", clipIds });
    },

    async updateClips(clips) {
      await send({ type: "update-clips", clips });
    },

    async updateBeat(clipId, beatType) {
      await send({ type: "update-beat", clipId, beatType });
    },

    async reorderClip(clipId, direction) {
      await send({ type: "reorder-clip", clipId, direction });
    },

    async createClipSectionAtInsertionPoint(input) {
      return send({
        type: "create-clip-section-at-insertion-point",
        input,
      }) as Promise<ClipSection>;
    },

    async createClipSectionAtPosition(input) {
      return send({
        type: "create-clip-section-at-position",
        input,
      }) as Promise<ClipSection>;
    },

    async updateClipSection(clipSectionId, name) {
      await send({ type: "update-clip-section", clipSectionId, name });
    },

    async archiveClipSections(clipSectionIds) {
      await send({ type: "archive-clip-sections", clipSectionIds });
    },

    async reorderClipSection(clipSectionId, direction) {
      await send({ type: "reorder-clip-section", clipSectionId, direction });
    },
  };
}

// ============================================================================
// Schema Definitions (for route validation)
// ============================================================================

const InsertionPointSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("start"),
  }),
  Schema.Struct({
    type: Schema.Literal("after-clip"),
    databaseClipId: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("after-clip-section"),
    clipSectionId: Schema.String,
  })
);

const ReorderDirectionSchema = Schema.Union(
  Schema.Literal("up"),
  Schema.Literal("down")
);

const PositionSchema = Schema.Union(
  Schema.Literal("before"),
  Schema.Literal("after")
);

const TargetItemTypeSchema = Schema.Union(
  Schema.Literal("clip"),
  Schema.Literal("clip-section")
);

const ClipInputSchema = Schema.Struct({
  inputVideo: Schema.String,
  startTime: Schema.Number,
  endTime: Schema.Number,
});

const AppendClipsInputSchema = Schema.Struct({
  videoId: Schema.String,
  insertionPoint: InsertionPointSchema,
  clips: Schema.Array(ClipInputSchema),
});

const AppendFromObsInputSchema = Schema.Struct({
  videoId: Schema.String,
  filePath: Schema.optional(Schema.String),
  insertionPoint: InsertionPointSchema,
});

const UpdateClipInputSchema = Schema.Struct({
  id: Schema.String,
  scene: Schema.String,
  profile: Schema.String,
  beatType: Schema.String,
});

const CreateClipSectionAtInsertionPointInputSchema = Schema.Struct({
  videoId: Schema.String,
  name: Schema.String,
  insertionPoint: InsertionPointSchema,
});

const CreateClipSectionAtPositionInputSchema = Schema.Struct({
  videoId: Schema.String,
  name: Schema.String,
  position: PositionSchema,
  targetItemId: Schema.String,
  targetItemType: TargetItemTypeSchema,
});

/**
 * Schema for validating ClipServiceEvent in the route handler.
 * This is a discriminated union matching all possible event types.
 */
export const ClipServiceEventSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("create-video"),
    path: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("get-timeline"),
    videoId: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("append-clips"),
    input: AppendClipsInputSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("append-from-obs"),
    input: AppendFromObsInputSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("archive-clips"),
    clipIds: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("update-clips"),
    clips: Schema.Array(UpdateClipInputSchema),
  }),
  Schema.Struct({
    type: Schema.Literal("update-beat"),
    clipId: Schema.String,
    beatType: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("reorder-clip"),
    clipId: Schema.String,
    direction: ReorderDirectionSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("create-clip-section-at-insertion-point"),
    input: CreateClipSectionAtInsertionPointInputSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("create-clip-section-at-position"),
    input: CreateClipSectionAtPositionInputSchema,
  }),
  Schema.Struct({
    type: Schema.Literal("update-clip-section"),
    clipSectionId: Schema.String,
    name: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("archive-clip-sections"),
    clipSectionIds: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("reorder-clip-section"),
    clipSectionId: Schema.String,
    direction: ReorderDirectionSchema,
  })
);

// ============================================================================
// HTTP Transport Factory (for frontend)
// ============================================================================

/**
 * Creates a ClipService that sends events to the /api/clip-service route.
 * This is the transport used in production by the frontend.
 */
export function createHttpClipService(): ClipService {
  const send = async (event: ClipServiceEvent): Promise<unknown> => {
    const response = await fetch("/api/clip-service", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ClipService request failed: ${response.status} ${text}`);
    }

    return response.json();
  };

  return createClipService(send);
}
