/**
 * Pure functions for section path naming conventions.
 *
 * Format: NN-slug (e.g., 01-intro, 02-advanced)
 *   NN = section number (zero-padded to match existing width)
 */

export type ParsedSectionPath = {
  sectionNumber: number;
  slug: string;
};

export type SectionForReorder = {
  id: string;
  path: string; // directory name like "01-intro"
};

export type SectionRenameEntry = {
  id: string;
  oldPath: string;
  newPath: string;
  oldSectionNumber: number;
  newSectionNumber: number;
};

/**
 * Builds a section directory name in NN-slug format.
 */
export const buildSectionPath = (
  sectionNumber: number,
  slug: string
): string => {
  const num = String(sectionNumber).padStart(2, "0");
  return `${num}-${slug}`;
};

/**
 * Parses a section directory name.
 *
 * "01-intro" → { sectionNumber: 1, slug: "intro" }
 * "12-advanced-topic" → { sectionNumber: 12, slug: "advanced-topic" }
 */
export const parseSectionPath = (
  sectionPath: string
): ParsedSectionPath | null => {
  const match = sectionPath.match(/^(\d+)-(.+)$/);
  if (!match) return null;
  return {
    sectionNumber: Number(match[1]),
    slug: match[2]!,
  };
};

/**
 * Given the current sections and the desired new order (as an array of IDs),
 * returns the list of renames needed to keep numbering sequential.
 *
 * @param currentSections - Sections with their current paths
 * @param newOrderIds - Section IDs in the desired new order
 * @returns Array of renames where the path actually changed
 */
/**
 * Converts a slug back to title case.
 * "before-we-start" → "Before We Start"
 */
export const titleFromSlug = (slug: string): string =>
  slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const computeSectionRenumberingPlan = (
  currentSections: SectionForReorder[],
  newOrderIds: readonly string[]
): SectionRenameEntry[] => {
  if (currentSections.length === 0 || newOrderIds.length === 0) return [];

  const sectionMap = new Map(currentSections.map((s) => [s.id, s]));

  const renames: SectionRenameEntry[] = [];
  for (let i = 0; i < newOrderIds.length; i++) {
    const section = sectionMap.get(newOrderIds[i]!);
    if (!section) continue;

    const parsed = parseSectionPath(section.path);
    if (!parsed) continue;

    const newSectionNumber = i + 1;
    const newPath = buildSectionPath(newSectionNumber, parsed.slug);
    if (newPath !== section.path) {
      renames.push({
        id: section.id,
        oldPath: section.path,
        newPath,
        oldSectionNumber: parsed.sectionNumber,
        newSectionNumber,
      });
    }
  }

  return renames;
};
