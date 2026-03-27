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

    it("should emit effect with databaseId when available", () => {
      const section = createSection({
        databaseId: did("db-123"),
      });
      const tester = createTester([section]).send({
        type: "update-section-description",
        frontendId: section.frontendId,
        description: "New desc",
      });
      expect(tester.getExec()).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "update-section-description",
          sectionId: "db-123",
          description: "New desc",
        })
      );
    });

    it("should emit effect with frontendId when databaseId is null", () => {
      const section = createSection({ databaseId: null });
      const tester = createTester([section]).send({
        type: "update-section-description",
        frontendId: section.frontendId,
        description: "Optimistic desc",
      });
      expect(tester.getExec()).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "update-section-description",
          sectionId: section.frontendId,
          description: "Optimistic desc",
        })
      );
    });

    it("should not emit effect if section not found", () => {
      const section = createSection();
      const tester = createTester([section]).send({
        type: "update-section-description",
        frontendId: fid("nonexistent"),
        description: "A description",
      });
      expect(tester.getExec()).not.toHaveBeenCalled();
    });

    it("should handle empty string description", () => {
      const section = createSection({ description: "Existing" });
      const state = createTester([section])
        .send({
          type: "update-section-description",
          frontendId: section.frontendId,
          description: "",
        })
        .getState();
      expect(state.sections[0]!.description).toBe("");
    });

    it("should only update the targeted section among multiple", () => {
      const section1 = createSection({ description: "First" });
      const section2 = createSection({ description: "Second" });
      const state = createTester([section1, section2])
        .send({
          type: "update-section-description",
          frontendId: section2.frontendId,
          description: "Updated second",
        })
        .getState();
      expect(state.sections[0]!.description).toBe("First");
      expect(state.sections[1]!.description).toBe("Updated second");
    });

    it("should handle section-description-updated as a no-op", () => {
      const section = createSection({ description: "Existing" });
      const state = createTester([section])
        .send({
          type: "section-description-updated",
          frontendId: section.frontendId,
        } as any)
        .getState();
      expect(state.sections[0]!.description).toBe("Existing");
    });
  });

  describe("rename-section", () => {
    it("should preserve number prefix when renaming a real section optimistically", () => {
      const section = createSection({ path: "01-old-slug" });
      const state = createTester([section])
        .send({
          type: "rename-section",
          frontendId: section.frontendId,
          title: "new-slug",
        })
        .getState();
      expect(state.sections[0]!.path).toBe("01-new-slug");
    });

    it("should not add a number prefix when renaming a ghost section", () => {
      const section = createSection({ path: "Ghost Section Title" });
      const state = createTester([section])
        .send({
          type: "rename-section",
          frontendId: section.frontendId,
          title: "New Ghost Title",
        })
        .getState();
      expect(state.sections[0]!.path).toBe("New Ghost Title");
    });

    it("should fall back to 'untitled' with prefix when title is whitespace", () => {
      const section = createSection({ path: "03-old-slug" });
      const state = createTester([section])
        .send({
          type: "rename-section",
          frontendId: section.frontendId,
          title: "   ",
        })
        .getState();
      expect(state.sections[0]!.path).toBe("03-untitled");
    });

    it("should fall back to 'untitled' without prefix for ghost section with empty title", () => {
      const section = createSection({ path: "Ghost Section" });
      const state = createTester([section])
        .send({
          type: "rename-section",
          frontendId: section.frontendId,
          title: "",
        })
        .getState();
      expect(state.sections[0]!.path).toBe("untitled");
    });

    it("should preserve multi-digit section numbers", () => {
      const section = createSection({ path: "12-advanced-topic" });
      const state = createTester([section])
        .send({
          type: "rename-section",
          frontendId: section.frontendId,
          title: "new-topic",
        })
        .getState();
      expect(state.sections[0]!.path).toBe("12-new-topic");
    });

    it("should return unchanged state if section not found", () => {
      const section = createSection({ path: "01-slug" });
      const initial = createTester([section]).getState();
      const state = createTester([section])
        .send({
          type: "rename-section",
          frontendId: fid("nonexistent-id"),
          title: "new-title",
        })
        .getState();
      expect(state.sections).toEqual(initial.sections);
    });
  });

  describe("add-section", () => {
    it("should initialize description as empty string on new section", () => {
      const state = createTester([])
        .send({
          type: "add-section",
          title: "New Section",
          repoVersionId: "version-1",
        })
        .getState();
      expect(state.sections[0]!.description).toBe("");
    });
  });
});
