/**
 * Pure functions for lesson path naming conventions.
 *
 * New format: XX.YY-slug (e.g., 01.03-my-lesson)
 *   XX = section number, YY = lesson number (both 2-digit zero-padded)
 *
 * Legacy format: XXX-slug (e.g., 003-my-lesson)
 *   XXX = lesson number only (3-digit zero-padded)
 */

/**
 * Converts a human-readable string to a valid dash-case slug.
 * Only lowercase letters, digits, and dashes are kept.
 */
export const toSlug = (input: string): string => {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

/**
 * Builds a lesson directory name in XX.YY-slug format.
 */
export const buildLessonPath = (
  sectionNumber: number,
  lessonNumber: number,
  slug: string
): string => {
  const section = String(sectionNumber).padStart(2, "0");
  const lesson = String(lessonNumber).padStart(2, "0");
  return `${section}.${lesson}-${slug}`;
};

export type ParsedLessonPath = {
  sectionNumber: number | undefined;
  lessonNumber: number;
  slug: string;
};

/**
 * Parses a lesson directory name.
 *
 * Two-digit format: "01.03-slug-name" → { sectionNumber: 1, lessonNumber: 3, slug: "slug-name" }
 * Three-digit format: "003-slug-name" → { sectionNumber: undefined, lessonNumber: 3, slug: "slug-name" }
 */
export const parseLessonPath = (
  lessonPath: string
): ParsedLessonPath | null => {
  // Two-digit format: XX.YY-slug (exactly 2 digits on each side of the dot)
  const twoDigitMatch = lessonPath.match(/^(\d{2})\.(\d{2})-(.+)$/);
  if (twoDigitMatch) {
    return {
      sectionNumber: Number(twoDigitMatch[1]),
      lessonNumber: Number(twoDigitMatch[2]),
      slug: twoDigitMatch[3]!,
    };
  }

  // Three-digit / legacy format: NNN-slug or NNN.N-slug
  const legacyMatch = lessonPath.match(/^(\d[\d.]*)-(.+)$/);
  if (legacyMatch) {
    return {
      sectionNumber: undefined,
      lessonNumber: Number(legacyMatch[1]),
      slug: legacyMatch[2]!,
    };
  }

  return null;
};
