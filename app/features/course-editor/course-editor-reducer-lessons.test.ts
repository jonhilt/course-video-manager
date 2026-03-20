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
  fsStatus: "on-disk",
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
  order: 1,
  lessons: [],
  ...overrides,
});

describe("courseEditorReducer — lesson operations", () => {
  describe("add-ghost-lesson", () => {
    it("should add an optimistic ghost lesson to the section", () => {
      const section = createSection();
      const tester = createTester([section]);
      const state = tester
        .send({
          type: "add-ghost-lesson",
          sectionFrontendId: section.frontendId,
          title: "New Ghost",
        })
        .getState();
      const lessons = state.sections[0]!.lessons;
      expect(lessons).toHaveLength(1);
      expect(lessons[0]!.title).toBe("New Ghost");
      expect(lessons[0]!.path).toBe("new-ghost");
      expect(lessons[0]!.fsStatus).toBe("ghost");
      expect(lessons[0]!.databaseId).toBeNull();
      expect(lessons[0]!.order).toBe(1);
    });

    it("should schedule an add-ghost-lesson effect", () => {
      const section = createSection({ databaseId: did("db-s-1") });
      const tester = createTester([section]);
      tester.send({
        type: "add-ghost-lesson",
        sectionFrontendId: section.frontendId,
        title: "Ghost Lesson",
      });
      expect(tester.getExec()).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "add-ghost-lesson",
          sectionId: did("db-s-1"),
          title: "Ghost Lesson",
        })
      );
    });

    it("should insert before an adjacent lesson", () => {
      const l1 = createLesson({ order: 1, path: "first" });
      const l2 = createLesson({ order: 2, path: "second" });
      const section = createSection({ lessons: [l1, l2] });
      const tester = createTester([section]);
      const state = tester
        .send({
          type: "add-ghost-lesson",
          sectionFrontendId: section.frontendId,
          title: "Inserted",
          adjacentLessonId: l2.frontendId,
          position: "before",
        })
        .getState();
      const paths = state.sections[0]!.lessons.map((l) => l.path);
      expect(paths).toEqual(["first", "inserted", "second"]);
      expect(state.sections[0]!.lessons.map((l) => l.order)).toEqual([1, 2, 3]);
    });

    it("should insert after an adjacent lesson", () => {
      const l1 = createLesson({ order: 1, path: "first" });
      const l2 = createLesson({ order: 2, path: "second" });
      const section = createSection({ lessons: [l1, l2] });
      const tester = createTester([section]);
      const state = tester
        .send({
          type: "add-ghost-lesson",
          sectionFrontendId: section.frontendId,
          title: "Inserted",
          adjacentLessonId: l1.frontendId,
          position: "after",
        })
        .getState();
      expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
        "first",
        "inserted",
        "second",
      ]);
    });

    it("should use frontendId as sectionId when section has no databaseId", () => {
      const section = createSection({ databaseId: null });
      const tester = createTester([section]);
      tester.send({
        type: "add-ghost-lesson",
        sectionFrontendId: section.frontendId,
        title: "Ghost",
      });
      expect(tester.getExec()).toHaveBeenCalledWith(
        expect.objectContaining({ sectionId: section.frontendId })
      );
    });
  });

  describe("create-real-lesson", () => {
    it("should add an optimistic on-disk lesson", () => {
      const section = createSection();
      const tester = createTester([section]);
      const state = tester
        .send({
          type: "create-real-lesson",
          sectionFrontendId: section.frontendId,
          title: "Real Lesson",
        })
        .getState();
      expect(state.sections[0]!.lessons).toHaveLength(1);
      expect(state.sections[0]!.lessons[0]!.fsStatus).toBe("on-disk");
      expect(state.sections[0]!.lessons[0]!.databaseId).toBeNull();
    });
  });

  describe("property updates", () => {
    it("should update lesson name/path", () => {
      const lesson = createLesson({ path: "old-name" });
      const section = createSection({ lessons: [lesson] });
      const tester = createTester([section]);
      const state = tester
        .send({
          type: "update-lesson-name",
          frontendId: lesson.frontendId,
          newSlug: "new-name",
        })
        .getState();
      expect(state.sections[0]!.lessons[0]!.path).toBe("new-name");
    });

    it("should update lesson title", () => {
      const lesson = createLesson({ title: "Old" });
      const section = createSection({ lessons: [lesson] });
      const state = createTester([section])
        .send({
          type: "update-lesson-title",
          frontendId: lesson.frontendId,
          title: "New",
        })
        .getState();
      expect(state.sections[0]!.lessons[0]!.title).toBe("New");
    });

    it("should update lesson description", () => {
      const lesson = createLesson();
      const section = createSection({ lessons: [lesson] });
      const state = createTester([section])
        .send({
          type: "update-lesson-description",
          frontendId: lesson.frontendId,
          description: "A desc",
        })
        .getState();
      expect(state.sections[0]!.lessons[0]!.description).toBe("A desc");
    });

    it("should update lesson icon", () => {
      const lesson = createLesson({ icon: null });
      const section = createSection({ lessons: [lesson] });
      const state = createTester([section])
        .send({
          type: "update-lesson-icon",
          frontendId: lesson.frontendId,
          icon: "code",
        })
        .getState();
      expect(state.sections[0]!.lessons[0]!.icon).toBe("code");
    });

    it("should update lesson priority", () => {
      const lesson = createLesson({ priority: 1 });
      const section = createSection({ lessons: [lesson] });
      const state = createTester([section])
        .send({
          type: "update-lesson-priority",
          frontendId: lesson.frontendId,
          priority: 3,
        })
        .getState();
      expect(state.sections[0]!.lessons[0]!.priority).toBe(3);
    });

    it("should update lesson dependencies", () => {
      const lesson = createLesson({ dependencies: null });
      const section = createSection({ lessons: [lesson] });
      const state = createTester([section])
        .send({
          type: "update-lesson-dependencies",
          frontendId: lesson.frontendId,
          dependencies: ["dep-1"],
        })
        .getState();
      expect(state.sections[0]!.lessons[0]!.dependencies).toEqual(["dep-1"]);
    });

    it("should schedule effect with correct lessonId", () => {
      const lesson = createLesson({ databaseId: did("db-l-1") });
      const section = createSection({ lessons: [lesson] });
      const tester = createTester([section]);
      tester.send({
        type: "update-lesson-name",
        frontendId: lesson.frontendId,
        newSlug: "x",
      });
      expect(tester.getExec()).toHaveBeenCalledWith(
        expect.objectContaining({ lessonId: did("db-l-1") })
      );
    });
  });

  describe("delete-lesson", () => {
    it("should remove the lesson and recompute orders", () => {
      const l1 = createLesson({ order: 1, path: "a" });
      const l2 = createLesson({ order: 2, path: "b" });
      const l3 = createLesson({ order: 3, path: "c" });
      const section = createSection({ lessons: [l1, l2, l3] });
      const state = createTester([section])
        .send({ type: "delete-lesson", frontendId: l2.frontendId })
        .getState();
      expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual(["a", "c"]);
      expect(state.sections[0]!.lessons.map((l) => l.order)).toEqual([1, 2]);
    });
  });

  describe("reorder-lessons", () => {
    it("should reorder and update order values", () => {
      const l1 = createLesson({ order: 1, path: "first" });
      const l2 = createLesson({ order: 2, path: "second" });
      const l3 = createLesson({ order: 3, path: "third" });
      const section = createSection({ lessons: [l1, l2, l3] });
      const state = createTester([section])
        .send({
          type: "reorder-lessons",
          sectionFrontendId: section.frontendId,
          lessonFrontendIds: [l3.frontendId, l1.frontendId, l2.frontendId],
        })
        .getState();
      expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
        "third",
        "first",
        "second",
      ]);
      expect(state.sections[0]!.lessons.map((l) => l.order)).toEqual([1, 2, 3]);
    });
  });

  describe("move-lesson-to-section", () => {
    it("should remove from source and add to target", () => {
      const lesson = createLesson({ path: "moving" });
      const s1 = createSection({ lessons: [lesson] });
      const s2 = createSection({ lessons: [] });
      const state = createTester([s1, s2])
        .send({
          type: "move-lesson-to-section",
          lessonFrontendId: lesson.frontendId,
          targetSectionFrontendId: s2.frontendId,
        })
        .getState();
      expect(state.sections[0]!.lessons).toHaveLength(0);
      expect(state.sections[1]!.lessons).toHaveLength(1);
      expect(state.sections[1]!.lessons[0]!.path).toBe("moving");
    });
  });

  describe("convert-to-ghost / create-on-disk", () => {
    it("should set fsStatus to ghost", () => {
      const lesson = createLesson({ fsStatus: "on-disk" });
      const section = createSection({ lessons: [lesson] });
      const state = createTester([section])
        .send({ type: "convert-to-ghost", frontendId: lesson.frontendId })
        .getState();
      expect(state.sections[0]!.lessons[0]!.fsStatus).toBe("ghost");
    });

    it("should set fsStatus to on-disk", () => {
      const lesson = createLesson({ fsStatus: "ghost" });
      const section = createSection({ lessons: [lesson] });
      const state = createTester([section])
        .send({ type: "create-on-disk", frontendId: lesson.frontendId })
        .getState();
      expect(state.sections[0]!.lessons[0]!.fsStatus).toBe("on-disk");
    });
  });

  describe("lesson reconciliation", () => {
    it("lesson-created should populate databaseId and path", () => {
      const section = createSection();
      const tester = createTester([section]);
      tester.send({
        type: "add-ghost-lesson",
        sectionFrontendId: section.frontendId,
        title: "Test",
      });
      const lessonFid = tester.getState().sections[0]!.lessons[0]!.frontendId;
      const state = tester
        .send({
          type: "lesson-created",
          frontendId: lessonFid,
          databaseId: did("db-l-1"),
          path: "server-path",
        })
        .getState();
      expect(state.sections[0]!.lessons[0]!.databaseId).toBe("db-l-1");
      expect(state.sections[0]!.lessons[0]!.path).toBe("server-path");
    });

    it("lesson-name-updated should update path", () => {
      const lesson = createLesson({ path: "old" });
      const section = createSection({ lessons: [lesson] });
      const state = createTester([section])
        .send({
          type: "lesson-name-updated",
          frontendId: lesson.frontendId,
          path: "new",
        })
        .getState();
      expect(state.sections[0]!.lessons[0]!.path).toBe("new");
    });

    it("no-op reconciliation returns same state ref", () => {
      const lesson = createLesson();
      const section = createSection({ lessons: [lesson] });
      const tester = createTester([section]);
      const before = tester.getState();
      const after = tester
        .send({ type: "lesson-deleted", frontendId: lesson.frontendId })
        .getState();
      expect(after).toBe(before);
    });
  });
});
