import { describe, expect, it } from "vitest";
import {
  toSlug,
  buildLessonPath,
  parseLessonPath,
} from "./lesson-path-service";

describe("toSlug", () => {
  it("converts spaces to dashes", () => {
    expect(toSlug("hello world")).toBe("hello-world");
  });

  it("lowercases input", () => {
    expect(toSlug("Hello World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(toSlug("hello! world?")).toBe("hello-world");
  });

  it("collapses multiple dashes", () => {
    expect(toSlug("hello---world")).toBe("hello-world");
  });

  it("trims leading and trailing dashes", () => {
    expect(toSlug("-hello-world-")).toBe("hello-world");
  });

  it("trims whitespace", () => {
    expect(toSlug("  hello world  ")).toBe("hello-world");
  });

  it("preserves digits", () => {
    expect(toSlug("lesson 42 intro")).toBe("lesson-42-intro");
  });

  it("passes through already-valid slugs", () => {
    expect(toSlug("already-valid-slug")).toBe("already-valid-slug");
  });

  it("handles empty string", () => {
    expect(toSlug("")).toBe("");
  });

  it("handles mixed case with special characters", () => {
    expect(toSlug("What's Up, Doc?")).toBe("whats-up-doc");
  });
});

describe("buildLessonPath", () => {
  it("produces XX.YY-slug format", () => {
    expect(buildLessonPath(1, 3, "my-lesson")).toBe("01.03-my-lesson");
  });

  it("zero-pads single-digit numbers", () => {
    expect(buildLessonPath(2, 5, "intro")).toBe("02.05-intro");
  });

  it("handles double-digit numbers", () => {
    expect(buildLessonPath(12, 15, "advanced-topic")).toBe(
      "12.15-advanced-topic"
    );
  });

  it("handles section 1 lesson 1", () => {
    expect(buildLessonPath(1, 1, "getting-started")).toBe(
      "01.01-getting-started"
    );
  });
});

describe("parseLessonPath", () => {
  describe("two-digit format (XX.YY-slug)", () => {
    it("parses standard path", () => {
      expect(parseLessonPath("01.03-my-lesson")).toEqual({
        sectionNumber: 1,
        lessonNumber: 3,
        slug: "my-lesson",
      });
    });

    it("parses double-digit numbers", () => {
      expect(parseLessonPath("12.15-advanced-topic")).toEqual({
        sectionNumber: 12,
        lessonNumber: 15,
        slug: "advanced-topic",
      });
    });

    it("preserves full slug with multiple dashes", () => {
      expect(parseLessonPath("01.01-getting-started-with-ts")).toEqual({
        sectionNumber: 1,
        lessonNumber: 1,
        slug: "getting-started-with-ts",
      });
    });
  });

  describe("three-digit / legacy format (NNN-slug)", () => {
    it("parses standard 3-digit path", () => {
      expect(parseLessonPath("003-example")).toEqual({
        sectionNumber: undefined,
        lessonNumber: 3,
        slug: "example",
      });
    });

    it("parses path with decimal lesson number", () => {
      expect(parseLessonPath("003.5-extended-example")).toEqual({
        sectionNumber: undefined,
        lessonNumber: 3.5,
        slug: "extended-example",
      });
    });

    it("parses single-digit legacy path", () => {
      expect(parseLessonPath("1-intro")).toEqual({
        sectionNumber: undefined,
        lessonNumber: 1,
        slug: "intro",
      });
    });
  });

  describe("invalid paths", () => {
    it("returns null for path without number prefix", () => {
      expect(parseLessonPath("no-number")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseLessonPath("")).toBeNull();
    });

    it("returns null for number-only path (no slug)", () => {
      expect(parseLessonPath("003")).toBeNull();
    });
  });

  describe("roundtrip", () => {
    it("buildLessonPath output is parseable by parseLessonPath", () => {
      const built = buildLessonPath(3, 7, "my-lesson");
      const parsed = parseLessonPath(built);
      expect(parsed).toEqual({
        sectionNumber: 3,
        lessonNumber: 7,
        slug: "my-lesson",
      });
    });
  });
});
