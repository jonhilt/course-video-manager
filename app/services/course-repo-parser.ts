import { Data, Effect } from "effect";
import { FileSystem } from "@effect/platform";
import path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";

class CourseRepoDoesNotExistError extends Data.TaggedError(
  "CourseRepoDoesNotExistError"
)<{
  repoPath: string;
}> {}

const splitFilePath = (filePath: string) => filePath.split(path.sep);

/**
 * Checks if the segment (before the first `-`) is a number.
 *
 * 003-example.ts
 * 01-foo.ts
 */
const startsWithNumber = (segment: string): boolean => {
  const numberSegment = segment.split("-")[0];

  if (numberSegment === undefined) {
    return false;
  }

  return !Number.isNaN(Number(numberSegment));
};

export const notFound = Symbol("notFound");

const getNumberFromPathSegment = (path: string) => {
  const numberSegment = path.split("-")[0];

  return Number.isNaN(Number(numberSegment)) ? notFound : Number(numberSegment);
};

type SectionAndLessonNumber = {
  sectionNumber: number;
  lessonNumber: number;
  lessonPathWithNumber: string;
  sectionPathWithNumber: string;
};

const serializeSectionAndLessonNumber = (
  sectionAndLessonNumber: SectionAndLessonNumber
) =>
  `${sectionAndLessonNumber.sectionNumber}-${sectionAndLessonNumber.lessonNumber}`;

export const getSectionAndLessonNumberFromPath = (
  filePath: string
): SectionAndLessonNumber | typeof notFound => {
  const segments = splitFilePath(filePath);

  const lastSegmentWithNumber = segments.findLastIndex(startsWithNumber);

  if (lastSegmentWithNumber === -1) {
    return notFound;
  }

  const exerciseSegment = segments[lastSegmentWithNumber]!!!;

  const sectionSegment = segments[lastSegmentWithNumber - 1];

  if (sectionSegment === undefined) {
    return notFound;
  }

  const sectionNumber = getNumberFromPathSegment(sectionSegment);

  if (sectionNumber === notFound) {
    return notFound;
  }

  const lessonNumber = getNumberFromPathSegment(exerciseSegment);

  if (lessonNumber === notFound) {
    return notFound;
  }

  return {
    sectionNumber,
    lessonNumber,
    lessonPathWithNumber: exerciseSegment,
    sectionPathWithNumber: sectionSegment,
  };
};

type Section = {
  sectionPathWithNumber: string;
  sectionNumber: number;
  lessons: {
    lessonPathWithNumber: string;
    lessonNumber: number;
  }[];
};

export class CourseRepoParserService extends Effect.Service<CourseRepoParserService>()(
  "CourseRepoParserService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      return {
        parseRepo: Effect.fn("parseRepo")(function* (repoPath: string) {
          const exists = yield* fs.exists(repoPath);

          if (!exists) {
            return yield* new CourseRepoDoesNotExistError({ repoPath });
          }

          const directories = yield* fs.readDirectory(repoPath, {
            recursive: true,
          });

          const uniqueExerciseMap = new Map<string, SectionAndLessonNumber>();

          for (const directory of directories) {
            const section = getSectionAndLessonNumberFromPath(directory);

            if (section === notFound) {
              continue;
            }

            const uniqueKey = serializeSectionAndLessonNumber(section);

            uniqueExerciseMap.set(uniqueKey, section);
          }

          const sectionMap = new Map<string, Section>();

          for (const [, lesson] of uniqueExerciseMap.entries()) {
            const section = sectionMap.get(lesson.sectionPathWithNumber);

            if (section === undefined) {
              sectionMap.set(lesson.sectionPathWithNumber, {
                sectionPathWithNumber: lesson.sectionPathWithNumber,
                sectionNumber: lesson.sectionNumber,
                lessons: [
                  {
                    lessonPathWithNumber: lesson.lessonPathWithNumber,
                    lessonNumber: lesson.lessonNumber,
                  },
                ],
              });
            } else {
              section.lessons.push({
                lessonPathWithNumber: lesson.lessonPathWithNumber,
                lessonNumber: lesson.lessonNumber,
              });
            }
          }

          return Array.from(sectionMap.values()).sort((a, b) => {
            return a.sectionNumber - b.sectionNumber;
          });
        }),
      };
    }),
    dependencies: [NodeFileSystem.layer],
  }
) {}
