import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { Console, Effect } from "effect";
import { ArrowLeft, MoveRight } from "lucide-react";
import { useState } from "react";
import { data, Link, useFetcher, useNavigate } from "react-router";
import type { Route } from "./+types/videos.$videoId.move-to-course";

export const meta: Route.MetaFunction = () => {
  return [{ title: `CVM - Move Video to Course` }];
};

export const loader = async (args: Route.LoaderArgs) => {
  const videoId = args.params.videoId;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;

    const video = yield* db.getVideoById(videoId);
    const standaloneVideos = yield* db.getStandaloneVideos();
    const plans = yield* db.getPlans();
    const repos = yield* db.getRepos();

    const reposWithStructure = yield* Effect.forEach(repos, (repo) =>
      Effect.gen(function* () {
        const repoWithSections = yield* db.getRepoWithSectionsById(repo.id);
        // Latest version is first (ordered by desc createdAt)
        const latestVersion = repoWithSections.versions[0] ?? null;
        return {
          id: repo.id,
          name: repo.name,
          filePath: repo.filePath,
          version: latestVersion,
        };
      })
    );

    return {
      video,
      standaloneVideos,
      plans,
      repos,
      reposWithStructure,
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

export default function Component(props: Route.ComponentProps) {
  const { video, standaloneVideos, plans, repos, reposWithStructure } =
    props.loaderData;
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("");
  const [isNewLesson, setIsNewLesson] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState("");

  const selectedRepo = reposWithStructure.find((r) => r.id === selectedRepoId);
  const sections = selectedRepo?.version?.sections ?? [];
  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const lessons = selectedSection?.lessons ?? [];

  const isSubmitting = fetcher.state !== "idle";
  const canSubmit =
    selectedSectionId &&
    (isNewLesson ? newLessonTitle.trim().length > 0 : selectedLessonId);

  const handleSubmit = () => {
    if (!canSubmit) return;

    const formData = new FormData();
    if (isNewLesson) {
      formData.set("sectionId", selectedSectionId);
      formData.set("newLessonTitle", newLessonTitle.trim());
    } else {
      formData.set("lessonId", selectedLessonId);
    }

    fetcher.submit(formData, {
      method: "post",
      action: `/api/videos/${video.id}/move-to-course`,
    });
  };

  // Navigate away after successful move
  if (fetcher.data && (fetcher.data as { success?: boolean }).success) {
    navigate("/videos");
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar
        repos={repos}
        standaloneVideos={standaloneVideos}
        plans={plans}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          <div className="mb-6">
            <Link
              to="/videos"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Videos
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MoveRight className="w-6 h-6" />
              Move to Course
            </h1>
            <p className="text-muted-foreground mt-1">
              Moving{" "}
              <span className="font-medium text-foreground">
                "{video.path}"
              </span>{" "}
              into a course lesson
            </p>
          </div>

          <div className="space-y-6 border rounded-lg p-6">
            <div className="space-y-2">
              <Label htmlFor="course-select">Course</Label>
              <Select
                value={selectedRepoId}
                onValueChange={(value) => {
                  setSelectedRepoId(value);
                  setSelectedSectionId("");
                  setSelectedLessonId("");
                  setIsNewLesson(false);
                }}
              >
                <SelectTrigger id="course-select">
                  <SelectValue placeholder="Select a course..." />
                </SelectTrigger>
                <SelectContent>
                  {reposWithStructure.map((repo) => (
                    <SelectItem key={repo.id} value={repo.id}>
                      {repo.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="section-select">Section</Label>
              <Select
                value={selectedSectionId}
                onValueChange={(value) => {
                  setSelectedSectionId(value);
                  setSelectedLessonId("");
                  setIsNewLesson(false);
                }}
                disabled={!selectedRepoId || sections.length === 0}
              >
                <SelectTrigger id="section-select">
                  <SelectValue
                    placeholder={
                      !selectedRepoId
                        ? "Select a course first..."
                        : sections.length === 0
                          ? "No sections available"
                          : "Select a section..."
                    }
                  />
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

            <div className="space-y-2">
              <Label htmlFor="lesson-select">Lesson</Label>
              <Select
                value={isNewLesson ? "__new__" : selectedLessonId}
                onValueChange={(value) => {
                  if (value === "__new__") {
                    setIsNewLesson(true);
                    setSelectedLessonId("");
                  } else {
                    setIsNewLesson(false);
                    setSelectedLessonId(value);
                  }
                }}
                disabled={!selectedSectionId}
              >
                <SelectTrigger id="lesson-select">
                  <SelectValue
                    placeholder={
                      !selectedSectionId
                        ? "Select a section first..."
                        : "Select a lesson..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {lessons.map((lesson) => (
                    <SelectItem key={lesson.id} value={lesson.id}>
                      {lesson.title || lesson.path}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Create new lesson</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isNewLesson && (
              <div className="space-y-2">
                <Label htmlFor="new-lesson-title">New Lesson Title</Label>
                <Input
                  id="new-lesson-title"
                  value={newLessonTitle}
                  onChange={(e) => setNewLessonTitle(e.target.value)}
                  placeholder="e.g. Introduction to TypeScript"
                  autoFocus
                />
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting}
              >
                <MoveRight className="w-4 h-4 mr-2" />
                {isSubmitting ? "Moving..." : "Move Video"}
              </Button>
              <Button variant="outline" onClick={() => navigate("/videos")}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
