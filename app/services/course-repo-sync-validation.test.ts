import { describe, it, expect } from "vitest";
import { parseSectionPath } from "./section-path-service";

describe("course-repo-sync-validation", () => {
  describe("section path filtering", () => {
    it("should skip ghost sections (unparseable paths)", () => {
      expect(parseSectionPath("My Ghost Section")).toBeNull();
      expect(parseSectionPath("untitled")).toBeNull();
    });

    it("should identify real sections (NN-slug format)", () => {
      expect(parseSectionPath("01-intro")).toEqual({
        sectionNumber: 1,
        slug: "intro",
      });
      expect(parseSectionPath("12-advanced-topic")).toEqual({
        sectionNumber: 12,
        slug: "advanced-topic",
      });
    });
  });

  describe("orphan detection patterns", () => {
    it("should match numbered directory entries", () => {
      const isNumbered = (entry: string) => /^\d/.test(entry);

      expect(isNumbered("01-intro")).toBe(true);
      expect(isNumbered("01.03-my-lesson")).toBe(true);
      expect(isNumbered("README.md")).toBe(false);
      expect(isNumbered(".git")).toBe(false);
      expect(isNumbered("__reorder_tmp_0_01.03-foo")).toBe(false);
    });

    it("should skip temp directories", () => {
      const shouldSkip = (entry: string) => entry.startsWith("__");

      expect(shouldSkip("__reorder_tmp_0_01.03-foo")).toBe(true);
      expect(shouldSkip("__section_reorder_tmp_0_01-bar")).toBe(true);
      expect(shouldSkip("01-intro")).toBe(false);
    });
  });
});
