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

describe("courseEditorReducer — move-lesson-to-section", () => {
  it("should remove from source and add to target (ghost lesson)", () => {
    const lesson = createLesson({ path: "moving", fsStatus: "ghost" });
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

  it("should materialize ghost target section when moving a real lesson", () => {
    const lesson = createLesson({
      path: "01.01-my-lesson",
      fsStatus: "real",
      order: 1,
    });
    const s1 = createSection({ path: "01-basics", lessons: [lesson] });
    const s2 = createSection({ path: "Advanced Topics", lessons: [] });
    const state = createTester([s1, s2])
      .send({
        type: "move-lesson-to-section",
        lessonFrontendId: lesson.frontendId,
        targetSectionFrontendId: s2.frontendId,
      })
      .getState();
    expect(state.sections[1]!.path).toBe("02-advanced-topics");
    expect(state.sections[1]!.lessons[0]!.path).toBe("02.01-my-lesson");
  });

  it("should revert source section to ghost when last real lesson leaves", () => {
    const lesson = createLesson({
      path: "01.01-only-lesson",
      fsStatus: "real",
      order: 1,
    });
    const s1 = createSection({ path: "01-basics", lessons: [lesson] });
    const s2 = createSection({ path: "02-advanced", lessons: [] });
    const state = createTester([s1, s2])
      .send({
        type: "move-lesson-to-section",
        lessonFrontendId: lesson.frontendId,
        targetSectionFrontendId: s2.frontendId,
      })
      .getState();
    expect(state.sections[0]!.path).toBe("Basics");
  });

  it("should revert source when ghost lessons remain but no real lessons", () => {
    const realLesson = createLesson({
      path: "01.01-real",
      fsStatus: "real",
      order: 1,
    });
    const ghostLesson = createLesson({
      path: "ghost-one",
      fsStatus: "ghost",
      order: 2,
    });
    const s1 = createSection({
      path: "01-basics",
      lessons: [realLesson, ghostLesson],
    });
    const s2 = createSection({ path: "02-advanced", lessons: [] });
    const state = createTester([s1, s2])
      .send({
        type: "move-lesson-to-section",
        lessonFrontendId: realLesson.frontendId,
        targetSectionFrontendId: s2.frontendId,
      })
      .getState();
    expect(state.sections[0]!.path).toBe("Basics");
    expect(state.sections[0]!.lessons).toHaveLength(1);
    expect(state.sections[0]!.lessons[0]!.fsStatus).toBe("ghost");
  });

  it("should NOT revert source section when other real lessons remain", () => {
    const l1 = createLesson({
      path: "01.01-first",
      fsStatus: "real",
      order: 1,
    });
    const l2 = createLesson({
      path: "01.02-second",
      fsStatus: "real",
      order: 2,
    });
    const s1 = createSection({ path: "01-basics", lessons: [l1, l2] });
    const s2 = createSection({ path: "02-advanced", lessons: [] });
    const state = createTester([s1, s2])
      .send({
        type: "move-lesson-to-section",
        lessonFrontendId: l1.frontendId,
        targetSectionFrontendId: s2.frontendId,
      })
      .getState();
    expect(state.sections[0]!.path).toBe("01-basics");
    expect(state.sections[0]!.lessons[0]!.path).toBe("01.01-second");
  });

  it("should NOT materialize target when moving a ghost lesson", () => {
    const lesson = createLesson({
      path: "ghost-lesson",
      fsStatus: "ghost",
      order: 1,
    });
    const s1 = createSection({ path: "01-basics", lessons: [lesson] });
    const s2 = createSection({ path: "My Ghost Section", lessons: [] });
    const state = createTester([s1, s2])
      .send({
        type: "move-lesson-to-section",
        lessonFrontendId: lesson.frontendId,
        targetSectionFrontendId: s2.frontendId,
      })
      .getState();
    expect(state.sections[1]!.path).toBe("My Ghost Section");
  });

  it("should renumber source real lessons after moving one out", () => {
    const l1 = createLesson({
      path: "01.01-alpha",
      fsStatus: "real",
      order: 1,
    });
    const l2 = createLesson({ path: "01.02-beta", fsStatus: "real", order: 2 });
    const l3 = createLesson({
      path: "01.03-gamma",
      fsStatus: "real",
      order: 3,
    });
    const s1 = createSection({ path: "01-basics", lessons: [l1, l2, l3] });
    const s2 = createSection({ path: "02-advanced", lessons: [] });
    const state = createTester([s1, s2])
      .send({
        type: "move-lesson-to-section",
        lessonFrontendId: l2.frontendId,
        targetSectionFrontendId: s2.frontendId,
      })
      .getState();
    expect(state.sections[0]!.lessons.map((l) => l.path)).toEqual([
      "01.01-alpha",
      "01.02-gamma",
    ]);
    expect(state.sections[1]!.lessons[0]!.path).toBe("02.01-beta");
  });
});
