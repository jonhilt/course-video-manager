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
import { toSlug } from "@/services/lesson-path-service";
import { RepoWriteService } from "@/services/repo-write-service";
import { parseSectionPath } from "@/services/section-path-service";
import { getStandaloneVideoFilePath } from "@/services/standalone-video-files";
import { FileSystem } from "@effect/platform";
import { Console, Effect } from "effect";
import { ArrowRightLeft } from "lucide-react";
import path from "node:path";
import { useState } from "react";
import { data, Form, redirect, useNavigate } from "react-router";
import type { Route } from "./+types/videos.$videoId.move-to-course";

export const loader = async (args: Route.LoaderArgs) => {
  const { videoId } = args.params;
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const video = yield* db.getVideoWithClipsById(videoId);

    if (video.lesson) {
      return yield* Effect.die(
        data("Video is not standalone", { status: 400 })
      );
    }

    const repos = yield* db.getRepos();
    const reposWithSections = yield* Effect.all(
      repos.map((repo) => db.getRepoWithSectionsById(repo.id))
    );

    return {
      video: { id: video.id, path: video.path },
      repos: reposWithSections,
    };
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

export const action = async (args: Route.ActionArgs) => {
  const { videoId } = args.params;
  const formData = await args.request.formData();
  const sectionId = formData.get("sectionId") as string;
  const lessonIdOrNew = formData.get("lessonId") as string;
  const newLessonTitle = (formData.get("newLessonTitle") as string) ?? "";

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const fs = yield* FileSystem.FileSystem;
    const repoWrite = yield* RepoWriteService;

    const section = yield* db.getSectionWithHierarchyById(sectionId);
    const repoPath = section.repoVersion.repo.filePath;
    const sectionPath = section.path;

    let lessonId: string;
    let lessonPath: string;

    if (lessonIdOrNew === "CREATE_NEW") {
      const sectionParsed = parseSectionPath(sectionPath);
      const sectionNumber = sectionParsed?.sectionNumber ?? 1;
      const slug = toSlug(newLessonTitle) || "untitled";

      const { lessonDirName, lessonNumber } = yield* repoWrite.addLesson({
        repoPath,
        sectionPath,
        sectionNumber,
        slug,
      });

      const [newLesson] = yield* db.createLessons(sectionId, [
        {
          lessonPathWithNumber: lessonDirName,
          lessonNumber,
        },
      ]);

      lessonId = newLesson!.id;
      lessonPath = lessonDirName;
    } else {
      const lesson = yield* db.getLessonWithHierarchyById(lessonIdOrNew);
      lessonId = lesson.id;
      lessonPath = lesson.path;
    }

    // Copy files from standalone dir to lesson dir with conflict resolution
    const sourceDir = getStandaloneVideoFilePath(videoId);
    const destDir = path.join(repoPath, sectionPath, lessonPath);

    const sourceExists = yield* fs.exists(sourceDir);
    if (sourceExists) {
      const files = yield* fs
        .readDirectory(sourceDir)
        .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

      for (const filename of files) {
        const srcFile = path.join(sourceDir, filename);
        const destFile = path.join(destDir, filename);

        const destExists = yield* fs.exists(destFile);
        let targetPath = destFile;

        if (destExists) {
          const ext = path.extname(filename);
          const base = path.basename(filename, ext);
          targetPath = path.join(destDir, `${base}-copy${ext}`);
        }

        const fileContent = yield* fs.readFile(srcFile);
        yield* fs.writeFile(targetPath, fileContent);
      }

      yield* fs.remove(sourceDir, { recursive: true });
    }

    yield* db.updateVideoLesson({ videoId, lessonId });

    return redirect(`/videos/${videoId}/edit`);
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

const CREATE_NEW = "CREATE_NEW";

export default function MoveToCourse({ loaderData }: Route.ComponentProps) {
  const { video, repos } = loaderData;
  const navigate = useNavigate();

  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("");
  const [newLessonTitle, setNewLessonTitle] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);
  const sections = selectedRepo?.versions[0]?.sections ?? [];
  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const lessons = selectedSection?.lessons ?? [];

  const isCreateNew = selectedLessonId === CREATE_NEW;

  const canSubmit =
    selectedSectionId &&
    selectedLessonId &&
    (isCreateNew ? newLessonTitle.trim().length > 0 : true);

  const handleRepoChange = (value: string) => {
    setSelectedRepoId(value);
    setSelectedSectionId("");
    setSelectedLessonId("");
    setNewLessonTitle("");
  };

  const handleSectionChange = (value: string) => {
    setSelectedSectionId(value);
    setSelectedLessonId("");
    setNewLessonTitle("");
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <ArrowRightLeft className="w-5 h-5" />
        <h2 className="text-xl font-semibold">Move to Course</h2>
      </div>

      <p className="text-muted-foreground mb-6">
        Moving &quot;{video.path}&quot; to a course lesson.
      </p>

      <Form
        method="post"
        onSubmit={() => setIsSubmitting(true)}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label>Course</Label>
          <Select value={selectedRepoId} onValueChange={handleRepoChange}>
            <SelectTrigger>
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

        {selectedRepoId && (
          <div className="space-y-2">
            <Label>Section</Label>
            <Select
              value={selectedSectionId}
              onValueChange={handleSectionChange}
            >
              <SelectTrigger>
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

        {selectedSectionId && (
          <div className="space-y-2">
            <Label>Lesson</Label>
            <Select
              value={selectedLessonId}
              onValueChange={setSelectedLessonId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a lesson..." />
              </SelectTrigger>
              <SelectContent>
                {lessons.map((lesson) => (
                  <SelectItem key={lesson.id} value={lesson.id}>
                    {lesson.path}
                  </SelectItem>
                ))}
                <SelectItem value={CREATE_NEW}>+ Create New Lesson</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {isCreateNew && (
          <div className="space-y-2">
            <Label>New Lesson Title</Label>
            <Input
              name="newLessonTitle"
              placeholder="Enter lesson title..."
              value={newLessonTitle}
              onChange={(e) => setNewLessonTitle(e.target.value)}
            />
          </div>
        )}

        <input type="hidden" name="sectionId" value={selectedSectionId} />
        <input type="hidden" name="lessonId" value={selectedLessonId} />

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? "Moving..." : "Move to Course"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/videos/${video.id}/edit`)}
          >
            Cancel
          </Button>
        </div>
      </Form>
    </div>
  );
}
