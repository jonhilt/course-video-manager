/**
 * CourseEditorService Integration Tests
 *
 * Tests all 4 section event types against a real PGlite database.
 * Uses mock CourseRepoWriteService (no filesystem) and noop sync validation.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import {
  createTestDb,
  truncateAllTables,
  type TestDb,
} from "@/test-utils/pglite";
import { createDirectCourseEditorService } from "./course-editor-service-handler";
import type { CourseEditorService } from "./course-editor-service";
import { DrizzleService } from "./drizzle-service.server";
import { DBFunctionsService } from "./db-service.server";
import { CourseWriteService } from "./course-write-service";
import { CourseRepoWriteService } from "./course-repo-write-service";
import { CourseRepoSyncValidationService } from "./course-repo-sync-validation";
import { NodeFileSystem } from "@effect/platform-node";
import * as schema from "@/db/schema";

let testDb: TestDb;
let editorService: CourseEditorService;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runtime: ManagedRuntime.ManagedRuntime<any, any>;

beforeAll(async () => {
  const result = await createTestDb();
  testDb = result.testDb;
});

beforeEach(async () => {
  await truncateAllTables(testDb);

  // Create test layer with PGlite DB and mock filesystem services
  const testDrizzleLayer = Layer.succeed(DrizzleService, testDb as any);

  const testDbFunctionsLayer = DBFunctionsService.Default.pipe(
    Layer.provide(testDrizzleLayer)
  );

  const mockRepoWriteLayer = Layer.succeed(CourseRepoWriteService, {
    createLessonDirectory: Effect.fn(function* (_opts: any) {
      return { lessonDirName: "mock", lessonNumber: 1 };
    }),
    addLesson: Effect.fn(function* (_opts: any) {
      return { newLessonDirName: "mock" };
    }),
    renameLesson: Effect.fn(function* (_opts: any) {
      return { newLessonDirName: "mock" };
    }),
    renameLessons: Effect.fn(function* (_opts: any) {}),
    renameSections: Effect.fn(function* (_opts: any) {}),
    deleteLesson: Effect.fn(function* (_opts: any) {}),
    moveLessonToSection: Effect.fn(function* (_opts: any) {}),
    sectionDirExists: Effect.fn(function* (_opts: any) {
      return false;
    }),
    deleteSectionDir: Effect.fn(function* (_opts: any) {}),
  } as any);

  const mockSyncValidationLayer = Layer.succeed(
    CourseRepoSyncValidationService,
    {
      validate: () => Effect.void,
    } as any
  );

  const testLayer = Layer.mergeAll(
    testDbFunctionsLayer,
    mockRepoWriteLayer,
    mockSyncValidationLayer,
    NodeFileSystem.layer
  ).pipe(Layer.provideMerge(testDrizzleLayer));

  // Use DefaultWithoutDependencies so we can provide our own mock deps
  // instead of the real filesystem/sync services bundled in .Default
  const serviceLayer = (
    CourseWriteService as any
  ).DefaultWithoutDependencies.pipe(Layer.provide(testLayer));

  const fullLayer = Layer.merge(testLayer, serviceLayer) as Layer.Layer<
    any,
    never,
    never
  >;

  runtime = ManagedRuntime.make(fullLayer);

  editorService = createDirectCourseEditorService((effect) =>
    runtime.runPromise(effect as any)
  );
});

// ============================================================================
// Test helpers
// ============================================================================

async function createCourseWithVersion(
  filePath: string | null = "/tmp/test-repo"
) {
  const [course] = await testDb
    .insert(schema.courses)
    .values({ name: "Test Course", filePath })
    .returning();

  const [version] = await testDb
    .insert(schema.courseVersions)
    .values({ repoId: course!.id, name: "v1" })
    .returning();

  return { course: course!, version: version! };
}

async function getSections(repoVersionId: string) {
  return testDb.query.sections.findMany({
    where: (s, { eq }) => eq(s.repoVersionId, repoVersionId),
    orderBy: (s, { asc }) => asc(s.order),
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("CourseEditorService", () => {
  describe("create-section", () => {
    it("creates a ghost section in the database", async () => {
      const { version } = await createCourseWithVersion();

      const result = await editorService.createSection(
        version.id,
        "Introduction",
        0
      );

      expect(result).toMatchObject({
        success: true,
        sectionId: expect.any(String),
      });

      const sections = await getSections(version.id);
      expect(sections).toHaveLength(1);
      expect(sections[0]).toMatchObject({
        path: "Introduction",
        order: 1,
        repoVersionId: version.id,
      });
    });

    it("creates multiple sections with correct ordering", async () => {
      const { version } = await createCourseWithVersion();

      await editorService.createSection(version.id, "Section A", 0);
      await editorService.createSection(version.id, "Section B", 1);
      await editorService.createSection(version.id, "Section C", 2);

      const sections = await getSections(version.id);
      expect(sections).toHaveLength(3);
      expect(sections.map((s) => s.path)).toEqual([
        "Section A",
        "Section B",
        "Section C",
      ]);
      expect(sections.map((s) => s.order)).toEqual([1, 2, 3]);
    });
  });

  describe("update-section-name", () => {
    it("renames a section with a parseable path", async () => {
      const { version } = await createCourseWithVersion();

      // Create a section with a parseable NN-slug format
      const [section] = await testDb
        .insert(schema.sections)
        .values({
          repoVersionId: version.id,
          path: "01-introduction",
          order: 1,
        })
        .returning();

      const result = await editorService.updateSectionName(
        section!.id,
        "Getting Started"
      );

      expect(result).toMatchObject({
        success: true,
        path: "01-getting-started",
      });

      const sections = await getSections(version.id);
      expect(sections[0]!.path).toBe("01-getting-started");
    });

    it("returns early when slug is unchanged", async () => {
      const { version } = await createCourseWithVersion();

      const [section] = await testDb
        .insert(schema.sections)
        .values({
          repoVersionId: version.id,
          path: "01-introduction",
          order: 1,
        })
        .returning();

      const result = await editorService.updateSectionName(
        section!.id,
        "Introduction"
      );

      expect(result).toMatchObject({
        success: true,
        path: "01-introduction",
      });
    });
  });

  describe("delete-section", () => {
    it("deletes a ghost section with no lessons", async () => {
      const { version } = await createCourseWithVersion();

      const result = await editorService.createSection(
        version.id,
        "To Delete",
        0
      );

      await editorService.deleteSection(result.sectionId);

      const sections = await getSections(version.id);
      expect(sections).toHaveLength(0);
    });

    it("deletes a ghost section and its ghost lessons", async () => {
      const { version } = await createCourseWithVersion();

      const createResult = await editorService.createSection(
        version.id,
        "To Delete",
        0
      );

      // Add ghost lessons directly
      await testDb.insert(schema.lessons).values([
        {
          sectionId: createResult.sectionId,
          path: "lesson-one",
          title: "Lesson One",
          fsStatus: "ghost",
          order: 1,
        },
        {
          sectionId: createResult.sectionId,
          path: "lesson-two",
          title: "Lesson Two",
          fsStatus: "ghost",
          order: 2,
        },
      ]);

      await editorService.deleteSection(createResult.sectionId);

      const sections = await getSections(version.id);
      expect(sections).toHaveLength(0);

      const lessons = await testDb.query.lessons.findMany();
      expect(lessons).toHaveLength(0);
    });

    it("rejects deleting a section with real lessons", async () => {
      const { version } = await createCourseWithVersion();

      const createResult = await editorService.createSection(
        version.id,
        "Has Real Lessons",
        0
      );

      await testDb.insert(schema.lessons).values({
        sectionId: createResult.sectionId,
        path: "01.01-real-lesson",
        title: "Real Lesson",
        fsStatus: "real",
        order: 1,
      });

      await expect(
        editorService.deleteSection(createResult.sectionId)
      ).rejects.toThrow();
    });
  });

  describe("reorder-sections", () => {
    it("reorders ghost sections by updating order field", async () => {
      const { version } = await createCourseWithVersion();

      const r1 = await editorService.createSection(version.id, "Alpha", 0);
      const r2 = await editorService.createSection(version.id, "Beta", 1);
      const r3 = await editorService.createSection(version.id, "Gamma", 2);

      // Reverse the order: Gamma, Beta, Alpha
      await editorService.reorderSections([
        r3.sectionId,
        r2.sectionId,
        r1.sectionId,
      ]);

      const sections = await getSections(version.id);
      expect(sections.map((s) => s.path)).toEqual(["Gamma", "Beta", "Alpha"]);
      expect(sections.map((s) => s.order)).toEqual([0, 1, 2]);
    });

    it("reorders parseable sections and updates paths", async () => {
      const { version } = await createCourseWithVersion();

      // Create sections with parseable paths (like real sections)
      const [s1] = await testDb
        .insert(schema.sections)
        .values({
          repoVersionId: version.id,
          path: "01-alpha",
          order: 0,
        })
        .returning();
      const [s2] = await testDb
        .insert(schema.sections)
        .values({
          repoVersionId: version.id,
          path: "02-beta",
          order: 1,
        })
        .returning();
      const [s3] = await testDb
        .insert(schema.sections)
        .values({
          repoVersionId: version.id,
          path: "03-gamma",
          order: 2,
        })
        .returning();

      // Reorder: gamma, alpha, beta
      await editorService.reorderSections([s3!.id, s1!.id, s2!.id]);

      const sections = await getSections(version.id);
      expect(sections.map((s) => s.path)).toEqual([
        "01-gamma",
        "02-alpha",
        "03-beta",
      ]);
      expect(sections.map((s) => s.order)).toEqual([0, 1, 2]);
    });
  });
});
