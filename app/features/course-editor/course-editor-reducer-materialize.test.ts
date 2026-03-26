import { describe, expect, it } from "vitest";
import {
  courseEditorReducer,
  createInitialCourseEditorState,
} from "./course-editor-reducer";
import { ReducerTester } from "@/test-utils/reducer-tester";
import type {
  FrontendId,
  DatabaseId,
  EditorSection,
  EditorLesson,
} from "./course-editor-types";

const createTester = (sections: EditorSection[] = []) =>
  new ReducerTester(
    courseEditorReducer,
    createInitialCourseEditorState(sections)
  );

const fid = (id: string) => id as FrontendId;
const did = (id: string) => id as DatabaseId;

const createLesson = (overrides: Partial<EditorLesson> = {}): EditorLesson => ({
  frontendId: fid(crypto.randomUUID()),
  databaseId: did(crypto.randomUUID()),
  sectionId: "section-1",
  path: "test-lesson",
  title: "Test Lesson",
  fsStatus: "real",
  description: "",
  icon: null,
  priority: 2,
  dependencies: null,
  order: 1,
  videos: [],
  ...overrides,
});

const createSection = (
  overrides: Partial<EditorSection> = {}
): EditorSection => ({
  frontendId: fid(crypto.randomUUID()),
  databaseId: did(crypto.randomUUID()),
  repoVersionId: "version-1",
  path: "test-section",
  description: "",
  order: 1,
  lessons: [],
  ...overrides,
});

describe("courseEditorReducer — materialization", () => {
  describe("create-on-disk optimistic lesson path", () => {
    it("should compute optimistic lesson path with numeric prefix in real section", () => {
      const lesson = createLesson({
        fsStatus: "ghost",
        path: "my-lesson",
        title: "My Lesson",
        order: 1,
      });
      const section = createSection({ path: "01-intro", lessons: [lesson] });
      const state = createTester([section])
        .send({ type: "create-on-disk", frontendId: lesson.frontendId })
        .getState();
      expect(state.sections[0]!.lessons[0]!.path).toBe("01.01-my-lesson");
    });

    it("should compute correct lesson number when real lessons exist before", () => {
      const realLesson = createLesson({
        fsStatus: "real",
        path: "01.01-first",
        title: "First",
        order: 1,
      });
      const ghostLesson = createLesson({
        fsStatus: "ghost",
        path: "second-lesson",
        title: "Second Lesson",
        order: 2,
      });
      const section = createSection({
        path: "01-intro",
        lessons: [realLesson, ghostLesson],
      });
      const state = createTester([section])
        .send({ type: "create-on-disk", frontendId: ghostLesson.frontendId })
        .getState();
      expect(state.sections[0]!.lessons[1]!.path).toBe("01.02-second-lesson");
    });

    it("should compute optimistic lesson path when materializing in ghost section", () => {
      const lesson = createLesson({
        fsStatus: "ghost",
        path: "my-lesson",
        title: "My Lesson",
        order: 1,
      });
      const section = createSection({
        path: "Getting Started",
        lessons: [lesson],
      });
      const state = createTester([section])
        .send({ type: "create-on-disk", frontendId: lesson.frontendId })
        .getState();
      expect(state.sections[0]!.path).toBe("01-getting-started");
      expect(state.sections[0]!.lessons[0]!.path).toBe("01.01-my-lesson");
    });

    it("should use title for slug, falling back to path", () => {
      const lesson = createLesson({
        fsStatus: "ghost",
        path: "raw-path",
        title: "",
        order: 1,
      });
      const section = createSection({ path: "01-intro", lessons: [lesson] });
      const state = createTester([section])
        .send({ type: "create-on-disk", frontendId: lesson.frontendId })
        .getState();
      expect(state.sections[0]!.lessons[0]!.path).toBe("01.01-raw-path");
    });

    it("should handle ghost lesson between two real lessons", () => {
      const l1 = createLesson({
        fsStatus: "real",
        path: "02.01-alpha",
        title: "Alpha",
        order: 1,
      });
      const ghost = createLesson({
        fsStatus: "ghost",
        path: "beta",
        title: "Beta",
        order: 2,
      });
      const l3 = createLesson({
        fsStatus: "real",
        path: "02.02-gamma",
        title: "Gamma",
        order: 3,
      });
      const section = createSection({
        path: "02-advanced",
        lessons: [l1, ghost, l3],
      });
      const state = createTester([section])
        .send({ type: "create-on-disk", frontendId: ghost.frontendId })
        .getState();
      expect(state.sections[0]!.lessons[1]!.path).toBe("02.02-beta");
    });
  });

  describe("lesson-created-on-disk reconciliation", () => {
    it("should update lesson path and fsStatus", () => {
      const lesson = createLesson({ fsStatus: "ghost", path: "old-path" });
      const section = createSection({ lessons: [lesson] });
      const state = createTester([section])
        .send({
          type: "lesson-created-on-disk",
          frontendId: lesson.frontendId,
          path: "01-01-new-path",
        })
        .getState();
      expect(state.sections[0]!.lessons[0]!.path).toBe("01-01-new-path");
      expect(state.sections[0]!.lessons[0]!.fsStatus).toBe("real");
    });

    it("should update section path when section was materialized", () => {
      const lesson = createLesson({ fsStatus: "ghost" });
      const section = createSection({
        lessons: [lesson],
        path: "Introduction",
      });
      const state = createTester([section])
        .send({
          type: "lesson-created-on-disk",
          frontendId: lesson.frontendId,
          path: "01-01-lesson",
          sectionId: section.databaseId as string,
          sectionPath: "01-introduction",
        })
        .getState();
      expect(state.sections[0]!.path).toBe("01-introduction");
    });

    it("should update courseFilePath when course was materialized", () => {
      const lesson = createLesson({ fsStatus: "ghost" });
      const section = createSection({ lessons: [lesson] });
      const tester = new ReducerTester(
        courseEditorReducer,
        createInitialCourseEditorState([section], { courseFilePath: null })
      );
      const state = tester
        .send({
          type: "lesson-created-on-disk",
          frontendId: lesson.frontendId,
          path: "01-01-lesson",
          courseFilePath: "/path/to/repo",
        })
        .getState();
      expect(state.courseFilePath).toBe("/path/to/repo");
    });

    it("should not overwrite courseFilePath when not provided", () => {
      const lesson = createLesson({ fsStatus: "ghost" });
      const section = createSection({ lessons: [lesson] });
      const tester = new ReducerTester(
        courseEditorReducer,
        createInitialCourseEditorState([section], {
          courseFilePath: "/existing/path",
        })
      );
      const state = tester
        .send({
          type: "lesson-created-on-disk",
          frontendId: lesson.frontendId,
          path: "01-01-lesson",
        })
        .getState();
      expect(state.courseFilePath).toBe("/existing/path");
    });
  });
});
