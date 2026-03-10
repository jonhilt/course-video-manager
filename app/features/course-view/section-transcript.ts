import type { Lesson, Section } from "./course-view-types";

export type TranscriptOptions = {
  includeTranscripts: boolean;
  includeLessonDescriptions: boolean;
  includeLessonTitles: boolean;
};

const defaultOptions: TranscriptOptions = {
  includeTranscripts: true,
  includeLessonDescriptions: false,
  includeLessonTitles: false,
};

export function buildCourseTranscript(
  coursePath: string,
  sections: Section[],
  options: TranscriptOptions = defaultOptions
) {
  const lines: string[] = [`<course title="${escapeAttr(coursePath)}">`];
  for (const section of sections) {
    // Skip sections where all lessons are ghosts
    if (section.lessons.every((l) => l.fsStatus === "ghost")) {
      continue;
    }
    const sectionLines = buildSectionTranscript(
      section.path,
      section.lessons,
      options
    );
    // Indent each line of the section transcript by 2 spaces
    for (const line of sectionLines.split("\n")) {
      lines.push(`  ${line}`);
    }
  }
  lines.push("</course>");
  return lines.join("\n");
}

export function buildSectionTranscript(
  sectionPath: string,
  lessons: Lesson[],
  options: TranscriptOptions = defaultOptions
) {
  const realLessons = lessons.filter((l) => l.fsStatus !== "ghost");
  const lines: string[] = [`<section title="${escapeAttr(sectionPath)}">`];
  for (const lesson of realLessons) {
    const lessonAttrs = [
      `title="${escapeAttr(lesson.path)}"`,
      ...(options.includeLessonTitles && lesson.title
        ? [`name="${escapeAttr(lesson.title)}"`]
        : []),
    ].join(" ");
    lines.push(`  <lesson ${lessonAttrs}>`);
    if (options.includeLessonDescriptions && lesson.description) {
      lines.push(
        `    <description>${escapeAttr(lesson.description)}</description>`
      );
    }
    if (lesson.videos.length === 0) {
      lines.push("    (no videos)");
      lines.push("  </lesson>");
      continue;
    }
    for (const video of lesson.videos) {
      lines.push(`    <video title="${escapeAttr(video.path)}">`);
      if (options.includeTranscripts) {
        if (video.clips.length === 0) {
          lines.push("      (no clips)");
          lines.push("    </video>");
          continue;
        }
        const transcript = video.clips
          .map((c) => c.text)
          .filter(Boolean)
          .join(" ");
        lines.push(`      ${transcript || "(no transcript)"}`);
      }
      lines.push("    </video>");
    }
    lines.push("  </lesson>");
  }
  lines.push("</section>");
  return lines.join("\n");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
