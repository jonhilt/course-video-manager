import { sortByOrder } from "@/lib/sort-by-order";
import type {
  IndexedClip,
  SectionWithWordCount,
} from "@/features/article-writer/types";

export interface ClipInput {
  order: string;
  text: string | null;
  sourceStartTime: number;
  sourceEndTime: number;
  videoFilename: string;
}

export interface ClipSectionInput {
  id: string;
  order: string;
  name: string;
}

export function buildTranscript(
  clips: readonly ClipInput[],
  clipSections: readonly ClipSectionInput[]
): {
  indexedClips: IndexedClip[];
  transcript: string;
  wordCount: number;
  sections: SectionWithWordCount[];
} {
  const sortedItems = sortByOrder([
    ...clips.map((clip) => ({
      type: "clip" as const,
      order: clip.order,
      text: clip.text,
      sourceStartTime: clip.sourceStartTime,
      sourceEndTime: clip.sourceEndTime,
      videoFilename: clip.videoFilename,
    })),
    ...clipSections.map((section) => ({
      type: "clip-section" as const,
      order: section.order,
      id: section.id,
      name: section.name,
    })),
  ]);

  const indexedClips: IndexedClip[] = [];
  const transcriptParts: string[] = [];
  let currentParagraph: string[] = [];
  let clipIndex = 0;

  const sections: SectionWithWordCount[] = [];
  let currentSectionIndex = -1;

  for (const item of sortedItems) {
    if (item.type === "clip-section") {
      if (currentParagraph.length > 0) {
        transcriptParts.push(currentParagraph.join(" "));
        currentParagraph = [];
      }
      transcriptParts.push(`## ${item.name}`);
      currentSectionIndex = sections.length;
      sections.push({
        id: item.id,
        name: item.name,
        order: item.order,
        wordCount: 0,
      });
    } else {
      clipIndex++;
      indexedClips.push({
        index: clipIndex,
        sourceStartTime: item.sourceStartTime,
        sourceEndTime: item.sourceEndTime,
        videoFilename: item.videoFilename,
        text: item.text,
      });

      if (item.text) {
        currentParagraph.push(`[${clipIndex}] ${item.text}`);
        if (currentSectionIndex >= 0) {
          sections[currentSectionIndex]!.wordCount +=
            item.text.split(/\s+/).length;
        }
      }
    }
  }

  if (currentParagraph.length > 0) {
    transcriptParts.push(currentParagraph.join(" "));
  }

  const transcript = transcriptParts.join("\n\n").trim();
  const wordCount = transcript ? transcript.split(/\s+/).length : 0;

  return { indexedClips, transcript, wordCount, sections };
}
