import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DBFunctionsService } from "@/services/db-service.server";
import { withDatabaseDump } from "@/services/dump-service";
import { runtimeLive } from "@/services/layer.server";
import { getStandaloneVideoFilePath } from "@/services/standalone-video-files";
import { FileSystem } from "@effect/platform";
import { Console, Effect, Schema } from "effect";
import { useState } from "react";
import { data, Form, Link, redirect, useNavigate } from "react-router";
import type { Route } from "./+types/videos.$videoId.move-to-course";
import { ChevronLeftIcon, MoveRightIcon } from "lucide-react";

export const loader = async (args: Route.LoaderArgs) => {
  const { videoId } = args.params;
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const video = yield* db.getVideoWithClipsById(videoId);
    const repos = yield* db.getRepos();
    const reposWithSections = yield* Effect.all(
      repos.map((repo) => db.getRepoWithSectionsById(repo.id))
    );
    return { video, repos: reposWithSections };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Video not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

const moveToCourseSchema = Schema.Union(
  Schema.Struct({
    mode: Schema.Literal("existing"),
    sectionId: Schema.String.pipe(
      Schema.minLength(1, { message: () => "Section is required" })
    ),
    lessonId: Schema.String.pipe(
      Schema.minLength(1, { message: () => "Lesson is required" })
    ),
  }),
  Schema.Struct({
    mode: Schema.Literal("new"),
    sectionId: Schema.String.pipe(
      Schema.minLength(1, { message: () => "Section is required" })
    ),
    newLessonName: Schema.String.pipe(
      Schema.minLength(1, { message: () => "Lesson name is required" })
    ),
  })
);

export const action = async (args: Route.ActionArgs) => {
  const { videoId } = args.params;
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const parsed =
      yield* Schema.decodeUnknown(moveToCourseSchema)(formDataObject);

    const db = yield* DBFunctionsService;
    const fs = yield* FileSystem.FileSystem;

    let lessonId: string;

    if (parsed.mode === "new") {
      const existingLessons = yield* db.getLessonsBySectionId(parsed.sectionId);
      const maxOrder =
        existingLessons.length > 0
          ? Math.max(...existingLessons.map((l) => l.order))
          : 0;
      const newOrder = maxOrder + 1;

      const safeName = parsed.newLessonName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
      const lessonPath = `${newOrder}-${safeName}`;

      const [newLesson] = yield* db.createLessons(parsed.sectionId, [
        {
          lessonPathWithNumber: lessonPath,
          lessonNumber: newOrder,
        },
      ]);

      if (!newLesson) {
        return yield* Effect.die(
          data("Failed to create lesson", { status: 500 })
        );
      }
      lessonId = newLesson.id;
    } else {
      lessonId = parsed.lessonId;
    }

    // Get lesson with full hierarchy to find the target directory
    const lesson = yield* db.getLessonWithHierarchyById(lessonId);
    const repo = lesson.section.repoVersion.repo;
    const targetDir = `${repo.filePath}/${lesson.section.path}/${lesson.path}`;

    // Copy files from standalone dir to lesson dir
    const standaloneDir = getStandaloneVideoFilePath(videoId);
    const standaloneDirExists = yield* fs.exists(standaloneDir);

    if (standaloneDirExists) {
      yield* fs.makeDirectory(targetDir, { recursive: true });

      const files = yield* fs.readDirectory(standaloneDir);

      yield* Effect.forEach(files, (file) =>
        Effect.gen(function* () {
          const srcPath = `${standaloneDir}/${file}`;
          const destPath = `${targetDir}/${file}`;

          const destExists = yield* fs.exists(destPath);
          let finalDestPath = destPath;

          if (destExists) {
            const dotIndex = file.lastIndexOf(".");
            const withCopy =
              dotIndex > 0
                ? `${file.slice(0, dotIndex)} copy${file.slice(dotIndex)}`
                : `${file} copy`;
            finalDestPath = `${targetDir}/${withCopy}`;
          }

          const fileContent = yield* fs.readFile(srcPath);
          yield* fs.writeFile(finalDestPath, fileContent);
        })
      );

      yield* fs.remove(standaloneDir, { recursive: true });
    }

    yield* db.updateVideoLesson({ videoId, lessonId });

    return redirect(`/videos/${videoId}/edit`);
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

export default function MoveToCourse({ loaderData }: Route.ComponentProps) {
  const { video, repos } = loaderData;
  const navigate = useNavigate();

  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("");
  const [createNewLesson, setCreateNewLesson] = useState(false);
  const [newLessonName, setNewLessonName] = useState("");

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);
  const currentVersion = selectedRepo?.versions[0];
  const sections = currentVersion?.sections ?? [];

  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const lessons = selectedSection?.lessons ?? [];

  const canSubmit =
    selectedSectionId &&
    (createNewLesson ? newLessonName.trim().length > 0 : selectedLessonId);

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b">
        <Button variant="ghost" size="icon" asChild>
          <Link
            to="/videos"
            onClick={(e) => e.preventDefault()}
            onMouseDown={(e) => {
              if (e.button === 0) navigate("/videos");
            }}
          >
            <ChevronLeftIcon className="size-6" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <MoveRightIcon className="size-5" />
          Move &ldquo;{video.path}&rdquo; to Course
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto p-6 space-y-6">
          <Form method="post" className="space-y-5">
            <input
              type="hidden"
              name="mode"
              value={createNewLesson ? "new" : "existing"}
            />

            {/* Course select */}
            <div className="space-y-2">
              <Label htmlFor="repo">Course</Label>
              <Select
                value={selectedRepoId}
                onValueChange={(value) => {
                  setSelectedRepoId(value);
                  setSelectedSectionId("");
                  setSelectedLessonId("");
                }}
              >
                <SelectTrigger id="repo">
                  <SelectValue placeholder="Select a course..." />
                </SelectTrigger>
                <SelectContent>
                  {repos.map((repo) => (
                    <SelectItem key={repo.id} value={repo.id}>
                      {repo.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Section select */}
            {selectedRepoId && (
              <div className="space-y-2">
                <Label htmlFor="section">Section</Label>
                <Select
                  value={selectedSectionId}
                  onValueChange={(value) => {
                    setSelectedSectionId(value);
                    setSelectedLessonId("");
                  }}
                  name="sectionId"
                >
                  <SelectTrigger id="section">
                    <SelectValue placeholder="Select a section..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Lesson select or new lesson */}
            {selectedSectionId && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label>Lesson</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateNewLesson(!createNewLesson);
                      setSelectedLessonId("");
                      setNewLessonName("");
                    }}
                    className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    {createNewLesson
                      ? "Select existing lesson"
                      : "Create new lesson"}
                  </button>
                </div>

                {createNewLesson ? (
                  <div className="space-y-2">
                    <Input
                      id="newLessonName"
                      name="newLessonName"
                      placeholder="New lesson name..."
                      value={newLessonName}
                      onChange={(e) => setNewLessonName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      The lesson will be appended at the end of the section.
                    </p>
                  </div>
                ) : (
                  <Select
                    value={selectedLessonId}
                    onValueChange={setSelectedLessonId}
                    name="lessonId"
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a lesson..." />
                    </SelectTrigger>
                    <SelectContent>
                      {lessons.map((lesson) => (
                        <SelectItem key={lesson.id} value={lesson.id}>
                          {lesson.path}
                          {lesson.title ? ` — ${lesson.title}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <Button type="submit" disabled={!canSubmit} className="w-full">
              <MoveRightIcon className="size-4 mr-2" />
              Move to Course
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}
