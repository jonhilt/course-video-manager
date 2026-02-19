import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { pushSchema } from "drizzle-kit/api";
import {
  createDirectClipService,
  type TtCliAdapter,
} from "./clip-service-handler";
import type { ClipService } from "./clip-service";
import {
  toDatabaseInsertionPoint,
  type FrontendId,
  type DatabaseId,
  type FrontendTimelineItem,
} from "./clip-service";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let clipService: ClipService;
let mockTtCli: TtCliAdapter;

describe("ClipService", () => {
  beforeEach(async () => {
    pglite = new PGlite();
    testDb = drizzle(pglite, { schema });
    const { apply } = await pushSchema(schema, testDb as any);
    await apply();

    // Default mock that returns no clips
    mockTtCli = {
      getLatestOBSVideoClips: vi.fn().mockResolvedValue({ clips: [] }),
    };

    clipService = createDirectClipService(testDb as any, mockTtCli);
  });

  describe("createVideo", () => {
    it("creates a standalone video", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      expect(video).toMatchObject({
        id: expect.any(String),
        path: "test-video.mp4",
        lessonId: null,
      });
    });
  });

  describe("getTimeline", () => {
    it("returns an empty timeline for a video with no clips", async () => {
      const video = await clipService.createVideo("test-video.mp4");
      const timeline = await clipService.getTimeline(video.id);

      expect(timeline).toEqual([]);
    });

    it("returns clips sorted by order", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      // Add clips at start
      const clips = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [
          { inputVideo: "test.mp4", startTime: 0, endTime: 10 },
          { inputVideo: "test.mp4", startTime: 10, endTime: 20 },
        ],
      });

      const timeline = await clipService.getTimeline(video.id);

      expect(timeline).toHaveLength(2);
      expect(timeline[0]).toMatchObject({ type: "clip" });
      expect(timeline[1]).toMatchObject({ type: "clip" });
      expect(timeline[0]!.data.id).toBe(clips[0]!.id);
      expect(timeline[1]!.data.id).toBe(clips[1]!.id);
    });

    it("returns clips and sections interleaved and sorted", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      // Add a clip at start
      const [clipA] = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [{ inputVideo: "test.mp4", startTime: 0, endTime: 10 }],
      });

      // Add a section after the clip
      const section = await clipService.createClipSectionAtInsertionPoint({
        videoId: video.id,
        name: "Section 1",
        insertionPoint: { type: "after-clip", databaseClipId: clipA!.id },
      });

      // Add a clip after the section
      const [clipB] = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: {
          type: "after-clip-section",
          clipSectionId: section.id,
        },
        clips: [{ inputVideo: "test.mp4", startTime: 10, endTime: 20 }],
      });

      const timeline = await clipService.getTimeline(video.id);

      expect(timeline).toHaveLength(3);
      expect(timeline.map((t) => ({ type: t.type, id: t.data.id }))).toEqual([
        { type: "clip", id: clipA!.id },
        { type: "clip-section", id: section.id },
        { type: "clip", id: clipB!.id },
      ]);
    });
  });

  describe("appendClips", () => {
    it("inserts clips at start", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const clips = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [{ inputVideo: "test.mp4", startTime: 0, endTime: 10 }],
      });

      expect(clips).toHaveLength(1);
      expect(clips[0]).toMatchObject({
        id: expect.any(String),
        videoId: video.id,
        videoFilename: "test.mp4",
        sourceStartTime: 0,
        sourceEndTime: 10,
      });
    });

    it("inserts clips after an existing clip", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const [clipA] = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [{ inputVideo: "test.mp4", startTime: 0, endTime: 10 }],
      });

      await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "after-clip", databaseClipId: clipA!.id },
        clips: [{ inputVideo: "test.mp4", startTime: 10, endTime: 20 }],
      });

      const timeline = await clipService.getTimeline(video.id);

      expect(timeline).toHaveLength(2);
      expect(timeline[0]!.data.id).toBe(clipA!.id);
    });

    it("inserts clips after a clip section", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const section = await clipService.createClipSectionAtInsertionPoint({
        videoId: video.id,
        name: "Section 1",
        insertionPoint: { type: "start" },
      });

      const clips = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: {
          type: "after-clip-section",
          clipSectionId: section.id,
        },
        clips: [{ inputVideo: "test.mp4", startTime: 0, endTime: 10 }],
      });

      const timeline = await clipService.getTimeline(video.id);

      expect(timeline).toHaveLength(2);
      expect(timeline[0]).toMatchObject({ type: "clip-section" });
      expect(timeline[1]).toMatchObject({ type: "clip" });
      expect(timeline[1]!.data.id).toBe(clips[0]!.id);
    });
  });

  describe("archiveClips", () => {
    it("archives a single clip", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const [clip] = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [{ inputVideo: "test.mp4", startTime: 0, endTime: 10 }],
      });

      await clipService.archiveClips([clip!.id]);

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline).toHaveLength(0);
    });

    it("archives multiple clips", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const clips = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [
          { inputVideo: "test.mp4", startTime: 0, endTime: 10 },
          { inputVideo: "test.mp4", startTime: 10, endTime: 20 },
        ],
      });

      await clipService.archiveClips(clips.map((c) => c.id));

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline).toHaveLength(0);
    });
  });

  describe("updateClips", () => {
    it("updates scene, profile, and beatType for a clip", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const [clip] = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [{ inputVideo: "test.mp4", startTime: 0, endTime: 10 }],
      });

      await clipService.updateClips([
        {
          id: clip!.id,
          scene: "intro",
          profile: "default",
          beatType: "start",
        },
      ]);

      const timeline = await clipService.getTimeline(video.id);
      const timelineItem = timeline[0]!;

      expect(timelineItem.type).toBe("clip");
      if (timelineItem.type === "clip") {
        expect(timelineItem.data.scene).toBe("intro");
        expect(timelineItem.data.profile).toBe("default");
        expect(timelineItem.data.beatType).toBe("start");
      }
    });
  });

  describe("updateBeat", () => {
    it("updates beat type for a single clip", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const [clip] = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [{ inputVideo: "test.mp4", startTime: 0, endTime: 10 }],
      });

      await clipService.updateBeat(clip!.id, "transition");

      const timeline = await clipService.getTimeline(video.id);
      const timelineItem = timeline[0]!;

      expect(timelineItem.type).toBe("clip");
      if (timelineItem.type === "clip") {
        expect(timelineItem.data.beatType).toBe("transition");
      }
    });
  });

  describe("reorderClip", () => {
    it("moves a clip up past another clip", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const clips = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [
          { inputVideo: "test.mp4", startTime: 0, endTime: 10 },
          { inputVideo: "test.mp4", startTime: 10, endTime: 20 },
        ],
      });

      const [clipA, clipB] = clips;

      // Move clipB up
      await clipService.reorderClip(clipB!.id, "up");

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline.map((t) => t.data.id)).toEqual([clipB!.id, clipA!.id]);
    });

    it("moves a clip down past another clip", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const clips = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [
          { inputVideo: "test.mp4", startTime: 0, endTime: 10 },
          { inputVideo: "test.mp4", startTime: 10, endTime: 20 },
        ],
      });

      const [clipA, clipB] = clips;

      // Move clipA down
      await clipService.reorderClip(clipA!.id, "down");

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline.map((t) => t.data.id)).toEqual([clipB!.id, clipA!.id]);
    });
  });

  describe("createClipSectionAtInsertionPoint", () => {
    it("creates a section at the start", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const section = await clipService.createClipSectionAtInsertionPoint({
        videoId: video.id,
        name: "Intro Section",
        insertionPoint: { type: "start" },
      });

      expect(section).toMatchObject({
        id: expect.any(String),
        videoId: video.id,
        name: "Intro Section",
      });

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline).toHaveLength(1);
      expect(timeline[0]).toMatchObject({ type: "clip-section" });
    });

    it("creates a section after a clip", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const [clip] = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [{ inputVideo: "test.mp4", startTime: 0, endTime: 10 }],
      });

      const section = await clipService.createClipSectionAtInsertionPoint({
        videoId: video.id,
        name: "After Clip Section",
        insertionPoint: { type: "after-clip", databaseClipId: clip!.id },
      });

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline.map((t) => ({ type: t.type, id: t.data.id }))).toEqual([
        { type: "clip", id: clip!.id },
        { type: "clip-section", id: section.id },
      ]);
    });
  });

  describe("createClipSectionAtPosition", () => {
    it("creates a section before a clip", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const [clip] = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [{ inputVideo: "test.mp4", startTime: 0, endTime: 10 }],
      });

      const section = await clipService.createClipSectionAtPosition({
        videoId: video.id,
        name: "Before Clip",
        position: "before",
        targetItemId: clip!.id,
        targetItemType: "clip",
      });

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline.map((t) => ({ type: t.type, id: t.data.id }))).toEqual([
        { type: "clip-section", id: section.id },
        { type: "clip", id: clip!.id },
      ]);
    });

    it("creates a section after a clip", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const [clip] = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [{ inputVideo: "test.mp4", startTime: 0, endTime: 10 }],
      });

      const section = await clipService.createClipSectionAtPosition({
        videoId: video.id,
        name: "After Clip",
        position: "after",
        targetItemId: clip!.id,
        targetItemType: "clip",
      });

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline.map((t) => ({ type: t.type, id: t.data.id }))).toEqual([
        { type: "clip", id: clip!.id },
        { type: "clip-section", id: section.id },
      ]);
    });
  });

  describe("updateClipSection", () => {
    it("updates the name of a clip section", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const section = await clipService.createClipSectionAtInsertionPoint({
        videoId: video.id,
        name: "Original Name",
        insertionPoint: { type: "start" },
      });

      await clipService.updateClipSection(section.id, "Updated Name");

      const timeline = await clipService.getTimeline(video.id);
      const updatedSection = timeline[0]!.data;
      expect((updatedSection as typeof section).name).toBe("Updated Name");
    });
  });

  describe("archiveClipSections", () => {
    it("archives a clip section", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const section = await clipService.createClipSectionAtInsertionPoint({
        videoId: video.id,
        name: "To Archive",
        insertionPoint: { type: "start" },
      });

      await clipService.archiveClipSections([section.id]);

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline).toHaveLength(0);
    });
  });

  describe("reorderClipSection", () => {
    it("moves a section up past a clip", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      const [clip] = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [{ inputVideo: "test.mp4", startTime: 0, endTime: 10 }],
      });

      const section = await clipService.createClipSectionAtInsertionPoint({
        videoId: video.id,
        name: "Section",
        insertionPoint: { type: "after-clip", databaseClipId: clip!.id },
      });

      // Move section up (before the clip)
      await clipService.reorderClipSection(section.id, "up");

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline.map((t) => ({ type: t.type, id: t.data.id }))).toEqual([
        { type: "clip-section", id: section.id },
        { type: "clip", id: clip!.id },
      ]);
    });
  });

  describe("appendFromObs", () => {
    it("returns empty array when CLI detects no clips", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      mockTtCli.getLatestOBSVideoClips = vi
        .fn()
        .mockResolvedValue({ clips: [] });

      const result = await clipService.appendFromObs({
        videoId: video.id,
        insertionPoint: { type: "start" },
      });

      expect(result).toEqual([]);
      expect(mockTtCli.getLatestOBSVideoClips).toHaveBeenCalledWith({
        filePath: undefined,
        startTime: undefined,
      });
    });

    it("inserts clips detected by CLI", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      mockTtCli.getLatestOBSVideoClips = vi.fn().mockResolvedValue({
        clips: [
          { inputVideo: "/mnt/c/obs/video.mkv", startTime: 0, endTime: 10 },
          { inputVideo: "/mnt/c/obs/video.mkv", startTime: 15, endTime: 25 },
        ],
      });

      const result = await clipService.appendFromObs({
        videoId: video.id,
        insertionPoint: { type: "start" },
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        videoFilename: "/mnt/c/obs/video.mkv",
        sourceStartTime: 0,
        sourceEndTime: 10,
      });

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline).toHaveLength(2);
    });

    it("converts Windows path to WSL path", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      mockTtCli.getLatestOBSVideoClips = vi
        .fn()
        .mockResolvedValue({ clips: [] });

      await clipService.appendFromObs({
        videoId: video.id,
        filePath: "C:\\Users\\Matt\\Videos\\obs\\recording.mkv",
        insertionPoint: { type: "start" },
      });

      expect(mockTtCli.getLatestOBSVideoClips).toHaveBeenCalledWith({
        filePath: "/mnt/c/Users/Matt/Videos/obs/recording.mkv",
        startTime: undefined,
      });
    });

    it("deduplicates clips that already exist", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      // First, add a clip directly
      await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [
          { inputVideo: "/mnt/c/obs/video.mkv", startTime: 0, endTime: 10 },
        ],
      });

      // CLI returns the same clip plus a new one
      mockTtCli.getLatestOBSVideoClips = vi.fn().mockResolvedValue({
        clips: [
          { inputVideo: "/mnt/c/obs/video.mkv", startTime: 0, endTime: 10 }, // duplicate
          { inputVideo: "/mnt/c/obs/video.mkv", startTime: 15, endTime: 25 }, // new
        ],
      });

      const result = await clipService.appendFromObs({
        videoId: video.id,
        insertionPoint: { type: "start" },
      });

      // Should only add the new clip
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        sourceStartTime: 15,
        sourceEndTime: 25,
      });

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline).toHaveLength(2);
    });

    it("calculates start time from last clip with same input video", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      // Add existing clip
      await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [
          { inputVideo: "/mnt/c/obs/video.mkv", startTime: 0, endTime: 100 },
        ],
      });

      mockTtCli.getLatestOBSVideoClips = vi.fn().mockResolvedValue({
        clips: [
          { inputVideo: "/mnt/c/obs/video.mkv", startTime: 150, endTime: 200 },
        ],
      });

      await clipService.appendFromObs({
        videoId: video.id,
        filePath: "C:\\obs\\video.mkv",
        insertionPoint: { type: "start" },
      });

      // Should pass startTime = endTime of last clip - 1 = 99
      expect(mockTtCli.getLatestOBSVideoClips).toHaveBeenCalledWith({
        filePath: "/mnt/c/obs/video.mkv",
        startTime: 99,
      });
    });

    it("inserts clips at specified insertion point", async () => {
      const video = await clipService.createVideo("test-video.mp4");

      // Add existing clip
      const [existingClip] = await clipService.appendClips({
        videoId: video.id,
        insertionPoint: { type: "start" },
        clips: [{ inputVideo: "other.mkv", startTime: 0, endTime: 10 }],
      });

      mockTtCli.getLatestOBSVideoClips = vi.fn().mockResolvedValue({
        clips: [
          { inputVideo: "/mnt/c/obs/new.mkv", startTime: 0, endTime: 10 },
        ],
      });

      const result = await clipService.appendFromObs({
        videoId: video.id,
        insertionPoint: {
          type: "after-clip",
          databaseClipId: existingClip!.id,
        },
      });

      const timeline = await clipService.getTimeline(video.id);
      expect(timeline.map((t) => t.data.id)).toEqual([
        existingClip!.id,
        result[0]!.id,
      ]);
    });
  });
});

// ============================================================================
// toDatabaseInsertionPoint Tests
// ============================================================================

// Helper factories for frontend timeline items
const makeClipOnDatabase = (overrides: {
  frontendId: FrontendId;
  databaseId: DatabaseId;
}): FrontendTimelineItem => ({
  type: "on-database",
  frontendId: overrides.frontendId,
  databaseId: overrides.databaseId,
});

const makeSectionOnDatabase = (overrides: {
  frontendId: FrontendId;
  databaseId: DatabaseId;
}): FrontendTimelineItem => ({
  type: "clip-section-on-database",
  frontendId: overrides.frontendId,
  databaseId: overrides.databaseId,
});

const makeOptimisticClip = (overrides: {
  frontendId: FrontendId;
}): FrontendTimelineItem => ({
  type: "optimistically-added",
  frontendId: overrides.frontendId,
});

const makeOptimisticSection = (overrides: {
  frontendId: FrontendId;
}): FrontendTimelineItem => ({
  type: "clip-section-optimistically-added",
  frontendId: overrides.frontendId,
});

describe("toDatabaseInsertionPoint", () => {
  describe("after-clip pointing at optimistic clip after a persisted section", () => {
    it("should resolve to after-clip-section when the nearest persisted item before the optimistic clip is a section", () => {
      const items: FrontendTimelineItem[] = [
        makeClipOnDatabase({
          frontendId: "clip-1" as FrontendId,
          databaseId: "db-1" as DatabaseId,
        }),
        makeSectionOnDatabase({
          frontendId: "section-1" as FrontendId,
          databaseId: "db-section-1" as DatabaseId,
        }),
        makeOptimisticClip({
          frontendId: "opt-1" as FrontendId,
        }),
      ];

      const result = toDatabaseInsertionPoint(
        { type: "after-clip", frontendClipId: "opt-1" as FrontendId },
        items
      );

      expect(result).toEqual({
        type: "after-clip-section",
        clipSectionId: "db-section-1",
      });
    });

    it("should resolve to after-clip-section when section is the only item before optimistic clip", () => {
      const items: FrontendTimelineItem[] = [
        makeSectionOnDatabase({
          frontendId: "section-1" as FrontendId,
          databaseId: "db-section-1" as DatabaseId,
        }),
        makeOptimisticClip({
          frontendId: "opt-1" as FrontendId,
        }),
      ];

      const result = toDatabaseInsertionPoint(
        { type: "after-clip", frontendClipId: "opt-1" as FrontendId },
        items
      );

      expect(result).toEqual({
        type: "after-clip-section",
        clipSectionId: "db-section-1",
      });
    });

    it("should resolve to after-clip when the nearest persisted item is a clip (not a section)", () => {
      const items: FrontendTimelineItem[] = [
        makeSectionOnDatabase({
          frontendId: "section-1" as FrontendId,
          databaseId: "db-section-1" as DatabaseId,
        }),
        makeClipOnDatabase({
          frontendId: "clip-1" as FrontendId,
          databaseId: "db-1" as DatabaseId,
        }),
        makeOptimisticClip({
          frontendId: "opt-1" as FrontendId,
        }),
      ];

      const result = toDatabaseInsertionPoint(
        { type: "after-clip", frontendClipId: "opt-1" as FrontendId },
        items
      );

      expect(result).toEqual({
        type: "after-clip",
        databaseClipId: "db-1",
      });
    });
  });

  describe("after-clip-section pointing at an optimistic section after a persisted section", () => {
    it("should resolve to after-clip-section of the nearest persisted section before the optimistic one", () => {
      const items: FrontendTimelineItem[] = [
        makeSectionOnDatabase({
          frontendId: "section-1" as FrontendId,
          databaseId: "db-section-1" as DatabaseId,
        }),
        makeClipOnDatabase({
          frontendId: "clip-1" as FrontendId,
          databaseId: "db-1" as DatabaseId,
        }),
        makeOptimisticSection({
          frontendId: "opt-section-1" as FrontendId,
        }),
      ];

      const result = toDatabaseInsertionPoint(
        {
          type: "after-clip-section",
          frontendClipSectionId: "opt-section-1" as FrontendId,
        },
        items
      );

      expect(result).toEqual({
        type: "after-clip",
        databaseClipId: "db-1",
      });
    });

    it("should resolve to after-clip-section when the nearest persisted item before optimistic section is a persisted section", () => {
      const items: FrontendTimelineItem[] = [
        makeSectionOnDatabase({
          frontendId: "section-1" as FrontendId,
          databaseId: "db-section-1" as DatabaseId,
        }),
        makeOptimisticSection({
          frontendId: "opt-section-1" as FrontendId,
        }),
      ];

      const result = toDatabaseInsertionPoint(
        {
          type: "after-clip-section",
          frontendClipSectionId: "opt-section-1" as FrontendId,
        },
        items
      );

      expect(result).toEqual({
        type: "after-clip-section",
        clipSectionId: "db-section-1",
      });
    });
  });

  describe("start", () => {
    it("should return start", () => {
      const result = toDatabaseInsertionPoint({ type: "start" }, []);
      expect(result).toEqual({ type: "start" });
    });
  });

  describe("end", () => {
    it("should return start when there are no persisted items", () => {
      const result = toDatabaseInsertionPoint({ type: "end" }, [
        makeOptimisticClip({ frontendId: "opt-1" as FrontendId }),
      ]);
      expect(result).toEqual({ type: "start" });
    });

    it("should return after-clip when last persisted item is a clip", () => {
      const items: FrontendTimelineItem[] = [
        makeClipOnDatabase({
          frontendId: "clip-1" as FrontendId,
          databaseId: "db-1" as DatabaseId,
        }),
      ];

      const result = toDatabaseInsertionPoint({ type: "end" }, items);
      expect(result).toEqual({
        type: "after-clip",
        databaseClipId: "db-1",
      });
    });

    it("should return after-clip-section when last persisted item is a section", () => {
      const items: FrontendTimelineItem[] = [
        makeClipOnDatabase({
          frontendId: "clip-1" as FrontendId,
          databaseId: "db-1" as DatabaseId,
        }),
        makeSectionOnDatabase({
          frontendId: "section-1" as FrontendId,
          databaseId: "db-section-1" as DatabaseId,
        }),
      ];

      const result = toDatabaseInsertionPoint({ type: "end" }, items);
      expect(result).toEqual({
        type: "after-clip-section",
        clipSectionId: "db-section-1",
      });
    });
  });
});
