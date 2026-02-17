import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import { FileSystem } from "@effect/platform";
import { Console, Effect, Schema } from "effect";
import path from "node:path";
import type { Route } from "./+types/api.write-readme";
import { data } from "react-router";

const writeReadmeSchema = Schema.Struct({
  lessonId: Schema.String,
  content: Schema.String,
  mode: Schema.optional(Schema.Literal("write", "append")),
});

export const action = async (args: Route.ActionArgs) => {
  const body = await args.request.json();

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const fs = yield* FileSystem.FileSystem;

    const parsed = yield* Schema.decodeUnknown(writeReadmeSchema)(body);
    const { lessonId, content, mode } = parsed;

    const lesson = yield* db.getLessonWithHierarchyById(lessonId);
    const lessonFullPath = path.join(
      lesson.section.repoVersion.repo.filePath,
      lesson.section.path,
      lesson.path
    );

    // Check for explainer folder first, then problem folder
    const explainerPath = path.join(lessonFullPath, "explainer");
    const problemPath = path.join(lessonFullPath, "problem");

    const explainerExists = yield* fs.exists(explainerPath);
    const problemExists = yield* fs.exists(problemPath);

    let targetPath: string;
    if (explainerExists) {
      targetPath = path.join(explainerPath, "readme.md");
    } else if (problemExists) {
      targetPath = path.join(problemPath, "readme.md");
    } else {
      return Response.json(
        { success: false, error: "No explainer or problem folder found" },
        { status: 400 }
      );
    }

    // Handle append mode
    if (mode === "append") {
      const fileExists = yield* fs.exists(targetPath);
      if (fileExists) {
        const existingContent = yield* fs.readFileString(targetPath);
        yield* fs.writeFileString(
          targetPath,
          existingContent + "\n\n" + content
        );
      } else {
        // If file doesn't exist, just create it
        yield* fs.writeFileString(targetPath, content);
      }
    } else {
      yield* fs.writeFileString(targetPath, content);
    }

    return Response.json({ success: true });
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Lesson not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
