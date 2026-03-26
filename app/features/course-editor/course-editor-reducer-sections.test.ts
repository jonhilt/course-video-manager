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
} from "./course-editor-types";

const createTester = (sections: EditorSection[] = []) =>
  new ReducerTester(
    courseEditorReducer,
    createInitialCourseEditorState(sections)
  );

const fid = (id: string) => id as FrontendId;
const did = (id: string) => id as DatabaseId;

const createSection = (
  overrides: Partial<EditorSection> = {}
): EditorSection => ({
  frontendId: fid(crypto.randomUUID()),
  databaseId: did(crypto.randomUUID()),
  repoVersionId: "version-1",
  path: "test-section",
  order: 1,
  description: "",
  lessons: [],
  ...overrides,
});

describe("courseEditorReducer — section operations", () => {
  describe("update-section-description", () => {
    it("should update section description optimistically", () => {
      const section = createSection();
      const state = createTester([section])
        .send({
          type: "update-section-description",
          frontendId: section.frontendId,
          description: "A section description",
        })
        .getState();
      expect(state.sections[0]!.description).toBe("A section description");
    });

    it("should return unchanged state if section not found", () => {
      const section = createSection();
      const state = createTester([section])
        .send({
          type: "update-section-description",
          frontendId: fid("nonexistent"),
          description: "A description",
        })
        .getState();
      expect(state.sections[0]!.description).toBe("");
    });
  });
});
