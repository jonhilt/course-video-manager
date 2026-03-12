import type { TextWritingAgentMode } from "@/routes/videos.$videoId.completions";

/**
 * Represents clip sections with calculated word counts for UI display.
 * Used in the write page to show section checkboxes with word counts.
 */
export type SectionWithWordCount = {
  id: string;
  name: string;
  order: string;
  wordCount: number;
};

/**
 * Writing mode for the article writer.
 * Inferred from the schema definition to ensure type safety.
 */
export type Mode = TextWritingAgentMode;

/**
 * AI model selection for article generation.
 */
export type Model = "claude-sonnet-4-5" | "claude-haiku-4-5";

/**
 * Indexed clip data passed to the client for ChooseScreenshot component.
 */
export type IndexedClip = {
  index: number;
  sourceStartTime: number;
  sourceEndTime: number;
  videoFilename: string;
  text: string | null;
};
