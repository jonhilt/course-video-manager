"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { CreateSectionModal } from "@/components/create-section-modal";
import { VideoModal } from "@/components/video-player";
import { useCourseViewReducer } from "@/hooks/use-course-view-reducer";
import { useFocusRevalidate } from "@/hooks/use-focus-revalidate";
import { getVideoPath } from "@/lib/get-video";
import { Button } from "@/components/ui/button";
import { DBFunctionsService } from "@/services/db-service.server";
import { FeatureFlagService } from "@/services/feature-flag-service";
import { runtimeLive } from "@/services/layer.server";
import { FileSystem } from "@effect/platform";
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Console, Effect } from "effect";
import { Plus } from "lucide-react";
import { useCallback, useContext, useMemo, useState } from "react";
import { data, useFetcher, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/_index";
import { toast } from "sonner";
import {
  findNewOrderViolations,
  findNewSectionOrderViolations,
} from "@/utils/dependency-violations";
import { UploadContext } from "@/features/upload-manager/upload-context";
import { ActionsDropdown } from "@/features/course-view/actions-menu";
import { SectionGrid } from "@/features/course-view/section-grid";
import {
  FilterBar,
  NoRepoView,
  RouteModals,
} from "@/features/course-view/course-view-components";
import { NextTodoCard } from "@/features/course-view/next-todo-card";

export const meta: Route.MetaFunction = ({ data }) => {
  const selectedRepo = data?.selectedRepo;

  if (selectedRepo) {
    return [
      {
        title: `CVM - ${selectedRepo.name}`,
      },
    ];
  }

  return [
    {
      title: "CVM",
    },
  ];
};

export const loader = async (args: Route.LoaderArgs) => {
  const url = new URL(args.request.url);
  const selectedRepoId = url.searchParams.get("repoId");
  const selectedVersionId = url.searchParams.get("versionId");

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const fs = yield* FileSystem.FileSystem;
    const featureFlags = yield* FeatureFlagService;

    // First get repos and versions for the selected repo
    const repos = yield* db.getRepos();
    const standaloneVideos = yield* db.getStandaloneVideos();
    const plans = yield* db.getPlans();

    let versions: Awaited<
      ReturnType<typeof db.getRepoVersions>
    > extends Effect.Effect<infer R, any, any>
      ? R
      : never = [];
    let selectedVersion: Awaited<
      ReturnType<typeof db.getLatestRepoVersion>
    > extends Effect.Effect<infer R, any, any>
      ? R
      : never = undefined;

    if (selectedRepoId) {
      versions = yield* db.getRepoVersions(selectedRepoId);

      // If versionId provided, use it; otherwise use latest
      if (selectedVersionId) {
        selectedVersion = yield* db
          .getRepoVersionById(selectedVersionId)
          .pipe(
            Effect.catchTag("NotFoundError", () => Effect.succeed(undefined))
          );
      } else {
        selectedVersion = yield* db.getLatestRepoVersion(selectedRepoId);
      }
    }

    const selectedRepo = yield* !selectedRepoId
      ? Effect.succeed(undefined)
      : db.getRepoWithSectionsById(selectedRepoId).pipe(
          Effect.andThen((repo) => {
            if (!repo) {
              return undefined;
            }

            // Get sections from selected version only (or latest if none selected)
            const versionData =
              repo.versions.find((v) => v.id === selectedVersion?.id) ??
              repo.versions[0];
            const allSections = versionData?.sections ?? [];

            return {
              ...repo,
              sections: allSections.filter((section) => {
                return !section.path.endsWith("ARCHIVE");
              }),
            };
          })
        );

    const hasExportedVideoMap: Record<string, boolean> = {};

    const videos = selectedRepo?.sections.flatMap((section) =>
      section.lessons.flatMap((lesson) => lesson.videos)
    );

    yield* Effect.forEach(videos ?? [], (video) => {
      return Effect.gen(function* () {
        const hasExportedVideo = yield* fs.exists(getVideoPath(video.id));

        hasExportedVideoMap[video.id] = hasExportedVideo;
      });
    });

    // Check for explainer folder in each lesson
    const hasExplainerFolderMap: Record<string, boolean> = {};

    const lessons =
      selectedRepo?.sections.flatMap((section) =>
        section.lessons
          .filter((lesson) => lesson.fsStatus !== "ghost")
          .map((lesson) => ({
            id: lesson.id,
            fullPath: `${selectedRepo.filePath}/${section.path}/${lesson.path}`,
          }))
      ) ?? [];

    const lessonHasFilesMap: Record<string, boolean> = {};

    yield* Effect.forEach(lessons, (lesson) => {
      return Effect.gen(function* () {
        const explainerPath = `${lesson.fullPath}/explainer`;
        const hasExplainerFolder = yield* fs.exists(explainerPath);

        hasExplainerFolderMap[lesson.id] = hasExplainerFolder;

        // Check if lesson directory has any files/subdirectories
        const entries = yield* fs
          .readDirectory(lesson.fullPath)
          .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));
        lessonHasFilesMap[lesson.id] = entries.length > 0;
      });
    });

    // Determine if selected version is the latest
    const latestVersion = versions[0];
    const isLatestVersion = !!(
      selectedVersion &&
      latestVersion &&
      selectedVersion.id === latestVersion.id
    );

    return {
      repos,
      standaloneVideos,
      selectedRepo,
      versions,
      selectedVersion,
      isLatestVersion,
      hasExportedVideoMap,
      hasExplainerFolderMap,
      lessonHasFilesMap,
      plans,
      showMediaFilesList: featureFlags.isEnabled("ENABLE_MEDIA_FILES_LIST"),
    };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Not Found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

export default function Component(props: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedRepoId = searchParams.get("repoId");
  const { state: viewState, dispatch } = useCourseViewReducer();
  const {
    isAddRepoModalOpen,
    isCreateSectionModalOpen,
    isAddStandaloneVideoModalOpen,
    addGhostLessonSectionId,
    addVideoToLessonId,
    editLessonId,
    editSectionId,
    convertToGhostLessonId,
    videoPlayerState,
    priorityFilter,
    iconFilter,
    fsStatusFilter,
  } = viewState;

  const [nextUpDismissed, setNextUpDismissed] = useState(false);
  const publishRepoFetcher = useFetcher();
  const { startExportUpload, startBatchExportUpload } =
    useContext(UploadContext);

  useFocusRevalidate({ enabled: !!selectedRepoId, intervalMs: 5000 });

  const deleteVideoFetcher = useFetcher();
  const deleteVideoFileFetcher = useFetcher();
  const deleteLessonFetcher = useFetcher();
  const revealVideoFetcher = useFetcher();
  const archiveRepoFetcher = useFetcher();
  const reorderLessonFetcher = useFetcher();
  const reorderSectionFetcher = useFetcher();
  const addGhostFetcher = useFetcher();
  const createSectionFetcher = useFetcher();
  const moveLessonFetcher = useFetcher();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleLessonDragEnd = useCallback(
    (
      sectionId: string,
      lessons: {
        id: string;
        title?: string | null;
        path: string;
        dependencies?: string[] | null;
      }[]
    ) =>
      (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const fromIndex = lessons.findIndex((l) => l.id === active.id);
        const toIndex = lessons.findIndex((l) => l.id === over.id);
        if (fromIndex === -1 || toIndex === -1) return;

        const newOrder = arrayMove(lessons, fromIndex, toIndex);

        const newViolations = findNewOrderViolations(lessons, newOrder);
        if (newViolations.length > 0) {
          const details = newViolations
            .map((v) => `${v.lessonLabel} → ${v.depLabel}`)
            .join(", ");
          toast.warning("Dependency violation introduced", {
            description: details,
          });
        }

        reorderLessonFetcher.submit(
          {
            sectionId,
            lessonIds: JSON.stringify(newOrder.map((l) => l.id)),
          },
          { method: "post", action: "/api/lessons/reorder" }
        );
      },
    [reorderLessonFetcher]
  );

  const handleSectionDragEnd = useCallback(
    (
      sections: {
        id: string;
        lessons: {
          id: string;
          title?: string | null;
          path: string;
          dependencies?: string[] | null;
        }[];
      }[],
      repoVersionId: string
    ) =>
      (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const fromIndex = sections.findIndex((s) => s.id === active.id);
        const toIndex = sections.findIndex((s) => s.id === over.id);
        if (fromIndex === -1 || toIndex === -1) return;

        const newOrder = arrayMove(sections, fromIndex, toIndex);

        const newViolations = findNewSectionOrderViolations(sections, newOrder);
        if (newViolations.length > 0) {
          const details = newViolations
            .map((v) => `${v.lessonLabel} → ${v.depLabel}`)
            .join(", ");
          toast.warning("Dependency violation introduced", {
            description: details,
          });
        }

        reorderSectionFetcher.submit(
          {
            repoVersionId,
            sectionIds: JSON.stringify(newOrder.map((s) => s.id)),
          },
          { method: "post", action: "/api/sections/reorder" }
        );
      },
    [reorderSectionFetcher]
  );

  const loaderData = props.loaderData;
  const repos = loaderData.repos;
  const currentRepo = loaderData.selectedRepo;

  const allFlatLessons = useMemo(
    () =>
      (currentRepo?.sections ?? []).flatMap((section, sectionIdx) =>
        section.lessons.map((lesson, lessonIdx) => ({
          id: lesson.id,
          number: `${sectionIdx + 1}.${lessonIdx + 1}`,
          title:
            lesson.fsStatus === "ghost"
              ? lesson.title || lesson.path
              : lesson.path,
          sectionId: section.id,
          sectionTitle: section.path,
          sectionNumber: sectionIdx + 1,
        }))
      ),
    [currentRepo?.sections]
  );

  const dependencyMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const section of currentRepo?.sections ?? []) {
      for (const lesson of section.lessons) {
        if (lesson.dependencies && lesson.dependencies.length > 0) {
          map[lesson.id] = lesson.dependencies;
        }
      }
    }
    return map;
  }, [currentRepo?.sections]);

  const handleBatchExport = () => {
    if (!loaderData.selectedVersion) return;
    startBatchExportUpload(loaderData.selectedVersion.id);
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <AppSidebar
        repos={repos}
        standaloneVideos={loaderData.standaloneVideos}
        selectedRepoId={selectedRepoId}
        isAddRepoModalOpen={isAddRepoModalOpen}
        setIsAddRepoModalOpen={(open) =>
          dispatch({ type: "set-add-repo-modal-open", open })
        }
        isAddStandaloneVideoModalOpen={isAddStandaloneVideoModalOpen}
        setIsAddStandaloneVideoModalOpen={(open) =>
          dispatch({ type: "set-add-standalone-video-modal-open", open })
        }
        plans={loaderData.plans}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {currentRepo ? (
            <>
              <div className="mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                      {currentRepo.name}
                      {loaderData.selectedVersion &&
                        loaderData.versions.length > 1 && (
                          <button
                            onClick={() =>
                              dispatch({
                                type: "set-version-selector-modal-open",
                                open: true,
                              })
                            }
                            className="text-muted-foreground hover:text-foreground transition-colors text-lg font-normal"
                          >
                            [{loaderData.selectedVersion.name}]
                          </button>
                        )}
                    </h1>
                    <ActionsDropdown
                      currentRepo={currentRepo}
                      data={loaderData}
                      dispatch={dispatch}
                      publishRepoFetcher={publishRepoFetcher}
                      archiveRepoFetcher={archiveRepoFetcher}
                      handleBatchExport={handleBatchExport}
                    />
                  </div>
                </div>
              </div>

              <NextTodoCard
                sections={currentRepo.sections}
                data={loaderData}
                navigate={navigate}
                addVideoToLessonId={addVideoToLessonId}
                editLessonId={editLessonId}
                convertToGhostLessonId={convertToGhostLessonId}
                dispatch={dispatch}
                startExportUpload={startExportUpload}
                revealVideoFetcher={revealVideoFetcher}
                deleteVideoFileFetcher={deleteVideoFileFetcher}
                deleteVideoFetcher={deleteVideoFetcher}
                deleteLessonFetcher={deleteLessonFetcher}
                allFlatLessons={allFlatLessons}
                dependencyMap={dependencyMap}
                dismissed={nextUpDismissed}
                onDismiss={() => setNextUpDismissed(true)}
              />

              <FilterBar
                selectedRepo={loaderData.selectedRepo}
                priorityFilter={priorityFilter}
                iconFilter={iconFilter}
                fsStatusFilter={fsStatusFilter}
                dispatch={dispatch}
              />

              <SectionGrid
                currentRepo={currentRepo}
                data={loaderData}
                sensors={sensors}
                handleSectionDragEnd={handleSectionDragEnd}
                handleLessonDragEnd={handleLessonDragEnd}
                reorderSectionFetcher={reorderSectionFetcher}
                reorderLessonFetcher={reorderLessonFetcher}
                deleteLessonFetcher={deleteLessonFetcher}
                addGhostFetcher={addGhostFetcher}
                createSectionFetcher={createSectionFetcher}
                moveLessonFetcher={moveLessonFetcher}
                priorityFilter={priorityFilter}
                iconFilter={iconFilter}
                fsStatusFilter={fsStatusFilter}
                addGhostLessonSectionId={addGhostLessonSectionId}
                editSectionId={editSectionId}
                addVideoToLessonId={addVideoToLessonId}
                editLessonId={editLessonId}
                convertToGhostLessonId={convertToGhostLessonId}
                dispatch={dispatch}
                navigate={navigate}
                startExportUpload={startExportUpload}
                revealVideoFetcher={revealVideoFetcher}
                deleteVideoFileFetcher={deleteVideoFileFetcher}
                deleteVideoFetcher={deleteVideoFetcher}
              />

              {loaderData.selectedVersion && (
                <div className="mt-6 flex justify-center">
                  <Button
                    variant="outline"
                    className="border-dashed"
                    onClick={() =>
                      dispatch({
                        type: "set-create-section-modal-open",
                        open: true,
                      })
                    }
                  >
                    <Plus className="w-4 h-4" />
                    Add Section
                  </Button>
                </div>
              )}

              {loaderData.selectedVersion && (
                <CreateSectionModal
                  repoVersionId={loaderData.selectedVersion.id}
                  maxOrder={currentRepo.sections.length}
                  open={isCreateSectionModalOpen}
                  onOpenChange={(open) =>
                    dispatch({ type: "set-create-section-modal-open", open })
                  }
                  fetcher={createSectionFetcher}
                />
              )}
            </>
          ) : (
            <NoRepoView
              repos={repos}
              standaloneVideos={loaderData.standaloneVideos}
              dispatch={dispatch}
              navigate={navigate}
            />
          )}
        </div>
      </div>

      <VideoModal
        videoId={videoPlayerState.videoId}
        videoPath={videoPlayerState.videoPath}
        isOpen={videoPlayerState.isOpen}
        onClose={() => {
          dispatch({ type: "close-video-player" });
        }}
      />

      <RouteModals
        currentRepo={currentRepo}
        data={loaderData}
        selectedRepoId={selectedRepoId}
        viewState={viewState}
        dispatch={dispatch}
        navigate={navigate}
        moveLessonFetcher={moveLessonFetcher}
      />
    </div>
  );
}
