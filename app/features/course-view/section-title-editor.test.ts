import { describe, it, expect } from "vitest";
import { buildSectionRenameAction } from "./section-title-editor";

describe("buildSectionRenameAction", () => {
  describe("ghost sections", () => {
    it("1. capitalizes and dispatches when title changes", () => {
      const result = buildSectionRenameAction({
        value: "new section title",
        isGhostSection: true,
        sectionPath: "Old Title",
        currentSlug: "Old Title",
        sectionId: "abc",
      });
      expect(result).toEqual({
        type: "rename-section",
        frontendId: "abc",
        title: "New Section Title",
      });
    });

    it("2. returns null when capitalized value equals current path (no-op)", () => {
      const result = buildSectionRenameAction({
        value: "before we start",
        isGhostSection: true,
        sectionPath: "Before We Start",
        currentSlug: "Before We Start",
        sectionId: "abc",
      });
      // capitalizeTitle("before we start") === "Before We Start" === sectionPath
      expect(result).toBeNull();
    });

    it("3. returns null for empty input", () => {
      const result = buildSectionRenameAction({
        value: "   ",
        isGhostSection: true,
        sectionPath: "Old Title",
        currentSlug: "Old Title",
        sectionId: "abc",
      });
      expect(result).toBeNull();
    });

    it("4. dispatches when title differs from current path", () => {
      const result = buildSectionRenameAction({
        value: "new title",
        isGhostSection: true,
        sectionPath: "Old Title",
        currentSlug: "Old Title",
        sectionId: "section-1",
      });
      expect(result).toEqual({
        type: "rename-section",
        frontendId: "section-1",
        title: "New Title",
      });
    });
  });

  describe("real (materialized) sections", () => {
    it("5. converts to slug and dispatches when slug changes", () => {
      const result = buildSectionRenameAction({
        value: "new slug name",
        isGhostSection: false,
        sectionPath: "01-old-slug",
        currentSlug: "old-slug",
        sectionId: "section-2",
      });
      expect(result).toEqual({
        type: "rename-section",
        frontendId: "section-2",
        title: "new-slug-name",
      });
    });

    it("6. returns null when slug is unchanged (no-op)", () => {
      const result = buildSectionRenameAction({
        value: "old-slug",
        isGhostSection: false,
        sectionPath: "01-old-slug",
        currentSlug: "old-slug",
        sectionId: "section-2",
      });
      expect(result).toBeNull();
    });

    it("7. returns null for empty slug input", () => {
      const result = buildSectionRenameAction({
        value: "",
        isGhostSection: false,
        sectionPath: "01-intro",
        currentSlug: "intro",
        sectionId: "section-3",
      });
      expect(result).toBeNull();
    });

    it("8. slugifies input with spaces and uppercase", () => {
      const result = buildSectionRenameAction({
        value: "Advanced TypeScript",
        isGhostSection: false,
        sectionPath: "02-intro",
        currentSlug: "intro",
        sectionId: "section-4",
      });
      expect(result).toEqual({
        type: "rename-section",
        frontendId: "section-4",
        title: "advanced-typescript",
      });
    });
  });
});
