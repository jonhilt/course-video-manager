import { AppSidebar } from "@/components/app-sidebar";
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
import { runtimeLive } from "@/services/layer.server";
import { Console, Effect } from "effect";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { data, redirect, useFetcher, useNavigate } from "react-router";
import type { Route } from "./+types/videos.$videoId.move-to-course";

export const meta: Route.MetaFunction = () => {
  return [{ title: "CVM - Move Video to Course" }];
};

export const loader = async (args: Route.LoaderArgs) => {
  const { videoId } = args.params;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;

    const video = yield* db.getVideoById(videoId);

    if (video.lessonId !== null) {
      return yield* Effect.die(redirect(`/videos/${videoId}/edit`));
    }

    const repos = yield* db.getRepos();
    const sidebarVideos = yield* db.getStandaloneVideos();
    const plans = yield* db.getPlans();

    const reposWithSections = yield* Effect.forEach(
      repos,
      (repo) => db.getRepoWithSectionsById(repo.id),
      { concurrency: "unbounded" }
    );

    // Map to a simpler structure for the UI
    const courseData = reposWithSections.map((repo) => ({
      id: repo.id,
      name: repo.name,
      sections: (repo.versions[0]?.sections ?? []).map((section) => ({
        id: section.id,
        path: section.path,
        lessons: section.lessons.map((lesson) => ({
          id: lesson.id,
          path: lesson.path,
          fsStatus: lesson.fsStatus,
        })),
      })),
    }));

    return { video, courseData, sidebarVideos, plans };
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
  const { video, courseData, sidebarVideos, plans } = props.loaderData;
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("");
  const [newLessonPath, setNewLessonPath] = useState<string>("");

  const selectedCourse = courseData.find((c) => c.id === selectedCourseId);
  const selectedSection = selectedCourse?.sections.find(
    (s) => s.id === selectedSectionId
  );

  const isCreatingNew = selectedLessonId === "__new__";
  const isSubmitting = fetcher.state === "submitting";

  const canSubmit =
    selectedSectionId &&
    selectedLessonId &&
    (!isCreatingNew || newLessonPath.trim() !== "");

  useEffect(() => {
    if (fetcher.data && (fetcher.data as { success?: boolean }).success) {
      navigate("/videos");
    }
  }, [fetcher.data, navigate]);

  // Reset section and lesson when course changes
  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedSectionId("");
    setSelectedLessonId("");
    setNewLessonPath("");
  };

  // Reset lesson when section changes
  const handleSectionChange = (sectionId: string) => {
    setSelectedSectionId(sectionId);
    setSelectedLessonId("");
    setNewLessonPath("");
  };

  const handleSubmit = () => {
    const formData: Record<string, string> = {
      sectionId: selectedSectionId,
      lessonId: selectedLessonId,
    };
    if (isCreatingNew && newLessonPath.trim()) {
      formData.newLessonPath = newLessonPath.trim();
    }
    fetcher.submit(formData, {
      method: "post",
      action: `/api/videos/${video.id}/move-to-course`,
    });
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar
        repos={courseData.map((c) => ({ id: c.id, name: c.name }))}
        standaloneVideos={sidebarVideos}
        plans={plans}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          <div className="flex items-center gap-3 mb-8">
            <ArrowRightLeft className="w-6 h-6" />
            <div>
              <h1 className="text-2xl font-bold">Move to Course</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Moving:{" "}
                <span className="font-medium text-foreground">
                  {video.path}
                </span>
              </p>
            </div>
          </div>

          <div className="space-y-6 border rounded-lg p-6">
            <div className="space-y-2">
              <Label>Course</Label>
              <Select
                value={selectedCourseId}
                onValueChange={handleCourseChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a course..." />
                </SelectTrigger>
                <SelectContent>
                  {courseData.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Section</Label>
              <Select
                value={selectedSectionId}
                onValueChange={handleSectionChange}
                disabled={!selectedCourseId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a section..." />
                </SelectTrigger>
                <SelectContent>
                  {(selectedCourse?.sections ?? []).map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Lesson</Label>
              <Select
                value={selectedLessonId}
                onValueChange={setSelectedLessonId}
                disabled={!selectedSectionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a lesson..." />
                </SelectTrigger>
                <SelectContent>
                  {(selectedSection?.lessons ?? []).map((lesson) => (
                    <SelectItem key={lesson.id} value={lesson.id}>
                      {lesson.path}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Create new lesson</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isCreatingNew && (
              <div className="space-y-2">
                <Label>New Lesson Path</Label>
                <Input
                  value={newLessonPath}
                  onChange={(e) => setNewLessonPath(e.target.value)}
                  placeholder="e.g. 01-my-new-lesson"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  This will be the directory name for the new lesson.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => navigate(-1)}
                disabled={isSubmitting}
                type="button"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Moving...
                  </>
                ) : (
                  "Move Video"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
