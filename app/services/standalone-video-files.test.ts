import { describe, it, expect } from "vitest";
import { getStandaloneVideoFilePath, isUrl } from "./standalone-video-files";

describe("isUrl", () => {
  it("returns true for https URLs", () => {
    expect(isUrl("https://res.cloudinary.com/test/image.png")).toBe(true);
  });

  it("returns true for http URLs", () => {
    expect(isUrl("http://example.com/file.png")).toBe(true);
  });

  it("returns false for local filenames", () => {
    expect(isUrl("image.png")).toBe(false);
    expect(isUrl("thumbnail-abc.png")).toBe(false);
    expect(isUrl("./relative/path.png")).toBe(false);
    expect(isUrl("/absolute/path.png")).toBe(false);
  });
});

describe("getStandaloneVideoFilePath", () => {
  it("returns directory path when no filename given", () => {
    const result = getStandaloneVideoFilePath("video-123");
    expect(result).toContain("video-123");
    expect(result).not.toContain("undefined");
  });

  it("joins local filename with base directory", () => {
    const result = getStandaloneVideoFilePath("video-123", "image.png");
    expect(result).toContain("video-123");
    expect(result).toContain("image.png");
  });

  it("returns URL as-is when filename is an https URL", () => {
    const url =
      "https://res.cloudinary.com/total-typescript/image/upload/v1772100428/ai-hero-images/alyzcymusoj0qby2wfhc.png";
    const result = getStandaloneVideoFilePath("video-123", url);
    expect(result).toBe(url);
  });

  it("returns URL as-is when filename is an http URL", () => {
    const url = "http://example.com/image.png";
    const result = getStandaloneVideoFilePath("video-123", url);
    expect(result).toBe(url);
  });
});
