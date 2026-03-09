import type { DrizzleDB } from "@/services/drizzle-service.server";
import {
  clips,
  clipSections,
  lessons,
  repos,
  repoVersions,
  sections,
  thumbnails,
  videos,
} from "@/db/schema";
import {
  CannotDeleteNonLatestVersionError,
  CannotDeleteOnlyVersionError,
  NotFoundError,
  NotLatestVersionError,
  UnknownDBServiceError,
} from "@/services/db-service-errors";
import { asc, desc, eq } from "drizzle-orm";
import { Effect } from "effect";

const makeDbCall = <T>(fn: () => Promise<T>) => {
  return Effect.tryPromise({
    try: fn,
    catch: (e) => new UnknownDBServiceError({ cause: e }),
  });
};

export const createVersionOperations = (db: DrizzleDB) => {
  const getRepoVersions = Effect.fn("getRepoVersions")(function* (
    repoId: string
  ) {
    const versions = yield* makeDbCall(() =>
      db.query.repoVersions.findMany({
        where: eq(repoVersions.repoId, repoId),
        orderBy: desc(repoVersions.createdAt),
      })
    );
    return versions;
  });

  const getLatestRepoVersion = Effect.fn("getLatestRepoVersion")(function* (
    repoId: string
  ) {
    const version = yield* makeDbCall(() =>
      db.query.repoVersions.findFirst({
        where: eq(repoVersions.repoId, repoId),
        orderBy: desc(repoVersions.createdAt),
      })
    );
    return version;
  });

  const getRepoVersionById = Effect.fn("getRepoVersionById")(function* (
    versionId: string
  ) {
    const version = yield* makeDbCall(() =>
      db.query.repoVersions.findFirst({
        where: eq(repoVersions.id, versionId),
      })
    );

    if (!version) {
      return yield* new NotFoundError({
        type: "getRepoVersionById",
        params: { versionId },
      });
    }

    return version;
  });

  const getRepoWithSectionsByVersion = Effect.fn(
    "getRepoWithSectionsByVersion"
  )(function* (opts: { repoId: string; versionId: string }) {
    const { repoId, versionId } = opts;
    const repo = yield* makeDbCall(() =>
      db.query.repos.findFirst({
        where: eq(repos.id, repoId),
      })
    );

    if (!repo) {
      return yield* new NotFoundError({
        type: "getRepoWithSectionsByVersion",
        params: { repoId, versionId },
      });
    }

    const versionSections = yield* makeDbCall(() =>
      db.query.sections.findMany({
        where: eq(sections.repoVersionId, versionId),
        orderBy: asc(sections.order),
        with: {
          lessons: {
            orderBy: asc(lessons.order),
            with: {
              videos: {
                orderBy: asc(videos.path),
                with: {
                  clips: {
                    orderBy: asc(clips.order),
                    where: eq(clips.archived, false),
                  },
                },
              },
            },
          },
        },
      })
    );

    return {
      ...repo,
      sections: versionSections,
    };
  });

  const getVersionWithSections = Effect.fn("getVersionWithSections")(function* (
    versionId: string
  ) {
    const version = yield* makeDbCall(() =>
      db.query.repoVersions.findFirst({
        where: eq(repoVersions.id, versionId),
        with: {
          repo: true,
          sections: {
            orderBy: asc(sections.order),
            with: {
              lessons: {
                orderBy: asc(lessons.order),
                with: {
                  videos: {
                    orderBy: asc(videos.path),
                    with: {
                      clips: {
                        orderBy: asc(clips.order),
                        where: eq(clips.archived, false),
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
    );

    if (!version) {
      return yield* new NotFoundError({
        type: "getVersionWithSections",
        params: { versionId },
      });
    }

    return version;
  });

  const createRepoVersion = Effect.fn("createRepoVersion")(function* (input: {
    repoId: string;
    name: string;
  }) {
    const [version] = yield* makeDbCall(() =>
      db.insert(repoVersions).values(input).returning()
    );

    if (!version) {
      return yield* new UnknownDBServiceError({
        cause: "No version was returned from the database",
      });
    }

    return version;
  });

  const updateRepoVersion = Effect.fn("updateRepoVersion")(function* (opts: {
    versionId: string;
    name: string;
    description: string;
  }) {
    const { versionId, name, description } = opts;
    const [updated] = yield* makeDbCall(() =>
      db
        .update(repoVersions)
        .set({ name, description })
        .where(eq(repoVersions.id, versionId))
        .returning()
    );

    if (!updated) {
      return yield* new NotFoundError({
        type: "updateRepoVersion",
        params: { versionId },
      });
    }

    return updated;
  });

  const deleteRepoVersion = Effect.fn("deleteRepoVersion")(function* (
    versionId: string
  ) {
    const version = yield* makeDbCall(() =>
      db.query.repoVersions.findFirst({
        where: eq(repoVersions.id, versionId),
      })
    );

    if (!version) {
      return yield* new NotFoundError({
        type: "deleteRepoVersion",
        params: { versionId },
      });
    }

    const allVersions = yield* makeDbCall(() =>
      db.query.repoVersions.findMany({
        where: eq(repoVersions.repoId, version.repoId),
        orderBy: desc(repoVersions.createdAt),
      })
    );

    if (allVersions.length <= 1) {
      return yield* new CannotDeleteOnlyVersionError({
        versionId,
        repoId: version.repoId,
      });
    }

    const latestVersion = allVersions[0];
    if (!latestVersion || latestVersion.id !== versionId) {
      return yield* new CannotDeleteNonLatestVersionError({
        versionId,
        latestVersionId: latestVersion?.id ?? "none",
      });
    }

    yield* makeDbCall(() =>
      db.delete(repoVersions).where(eq(repoVersions.id, versionId))
    );

    const newLatestVersion = allVersions[1];
    return newLatestVersion;
  });

  const copyVersionStructure = Effect.fn("copyVersionStructure")(
    function* (input: {
      sourceVersionId: string;
      repoId: string;
      newVersionName: string;
    }) {
      const latestVersion = yield* makeDbCall(() =>
        db.query.repoVersions.findFirst({
          where: eq(repoVersions.repoId, input.repoId),
          orderBy: desc(repoVersions.createdAt),
        })
      );

      if (!latestVersion || latestVersion.id !== input.sourceVersionId) {
        return yield* new NotLatestVersionError({
          sourceVersionId: input.sourceVersionId,
          latestVersionId: latestVersion?.id ?? "none",
        });
      }

      const newVersion = yield* makeDbCall(() =>
        db
          .insert(repoVersions)
          .values({
            repoId: input.repoId,
            name: input.newVersionName,
          })
          .returning()
      ).pipe(
        Effect.andThen((arr) => {
          const v = arr[0];
          if (!v) {
            return Effect.fail(
              new UnknownDBServiceError({ cause: "No version returned" })
            );
          }
          return Effect.succeed(v);
        })
      );

      const sourceSections = yield* makeDbCall(() =>
        db.query.sections.findMany({
          where: eq(sections.repoVersionId, input.sourceVersionId),
          orderBy: asc(sections.order),
          with: {
            lessons: {
              orderBy: asc(lessons.order),
              with: {
                videos: {
                  orderBy: asc(videos.path),
                  with: {
                    clips: {
                      orderBy: asc(clips.order),
                      where: eq(clips.archived, false),
                    },
                    clipSections: {
                      orderBy: asc(clipSections.order),
                      where: eq(clipSections.archived, false),
                    },
                    thumbnails: true,
                  },
                },
              },
            },
          },
        })
      );

      const videoIdMappings: Array<{
        sourceVideoId: string;
        newVideoId: string;
      }> = [];

      for (const sourceSection of sourceSections) {
        const [newSection] = yield* makeDbCall(() =>
          db
            .insert(sections)
            .values({
              repoVersionId: newVersion.id,
              previousVersionSectionId: sourceSection.id,
              path: sourceSection.path,
              order: sourceSection.order,
            })
            .returning()
        );

        if (!newSection) continue;

        for (const sourceLesson of sourceSection.lessons) {
          const [newLesson] = yield* makeDbCall(() =>
            db
              .insert(lessons)
              .values({
                sectionId: newSection.id,
                previousVersionLessonId: sourceLesson.id,
                path: sourceLesson.path,
                order: sourceLesson.order,
                fsStatus: sourceLesson.fsStatus,
                title: sourceLesson.title,
                description: sourceLesson.description,
                icon: sourceLesson.icon,
                priority: sourceLesson.priority,
                dependencies: sourceLesson.dependencies,
              })
              .returning()
          );

          if (!newLesson) continue;

          for (const sourceVideo of sourceLesson.videos) {
            const [newVideo] = yield* makeDbCall(() =>
              db
                .insert(videos)
                .values({
                  lessonId: newLesson.id,
                  path: sourceVideo.path,
                  originalFootagePath: sourceVideo.originalFootagePath,
                })
                .returning()
            );

            if (!newVideo) continue;

            videoIdMappings.push({
              sourceVideoId: sourceVideo.id,
              newVideoId: newVideo.id,
            });

            if (sourceVideo.clips.length > 0) {
              yield* makeDbCall(() =>
                db.insert(clips).values(
                  sourceVideo.clips.map((clip) => ({
                    videoId: newVideo.id,
                    videoFilename: clip.videoFilename,
                    sourceStartTime: clip.sourceStartTime,
                    sourceEndTime: clip.sourceEndTime,
                    order: clip.order,
                    archived: false,
                    text: clip.text,
                    transcribedAt: clip.transcribedAt,
                    scene: clip.scene,
                    profile: clip.profile,
                    beatType: clip.beatType,
                  }))
                )
              );
            }

            if (sourceVideo.clipSections.length > 0) {
              yield* makeDbCall(() =>
                db.insert(clipSections).values(
                  sourceVideo.clipSections.map((section) => ({
                    videoId: newVideo.id,
                    name: section.name,
                    order: section.order,
                    archived: false,
                  }))
                )
              );
            }

            if (sourceVideo.thumbnails.length > 0) {
              yield* makeDbCall(() =>
                db.insert(thumbnails).values(
                  sourceVideo.thumbnails.map((thumbnail) => ({
                    videoId: newVideo.id,
                    layers: thumbnail.layers,
                    filePath: thumbnail.filePath,
                    selectedForUpload: thumbnail.selectedForUpload,
                  }))
                )
              );
            }
          }
        }
      }

      return { version: newVersion, videoIdMappings };
    }
  );

  const getVideoIdsForVersion = Effect.fn("getVideoIdsForVersion")(function* (
    versionId: string
  ) {
    const versionSections = yield* makeDbCall(() =>
      db.query.sections.findMany({
        where: eq(sections.repoVersionId, versionId),
        with: {
          lessons: {
            with: {
              videos: {
                columns: {
                  id: true,
                },
              },
            },
          },
        },
      })
    );

    const videoIds: string[] = [];
    for (const section of versionSections) {
      for (const lesson of section.lessons) {
        for (const video of lesson.videos) {
          videoIds.push(video.id);
        }
      }
    }

    return videoIds;
  });

  const getAllVersionsWithStructure = Effect.fn("getAllVersionsWithStructure")(
    function* (repoId: string) {
      const versions = yield* makeDbCall(() =>
        db.query.repoVersions.findMany({
          where: eq(repoVersions.repoId, repoId),
          orderBy: desc(repoVersions.createdAt),
        })
      );

      const versionsWithStructure: Array<{
        id: string;
        name: string;
        description: string;
        createdAt: Date;
        sections: Array<{
          id: string;
          path: string;
          previousVersionSectionId: string | null;
          lessons: Array<{
            id: string;
            path: string;
            previousVersionLessonId: string | null;
            videos: Array<{
              id: string;
              path: string;
              clips: Array<{
                id: string;
                text: string;
              }>;
            }>;
          }>;
        }>;
      }> = [];

      for (const version of versions) {
        const versionSections = yield* makeDbCall(() =>
          db.query.sections.findMany({
            where: eq(sections.repoVersionId, version.id),
            orderBy: asc(sections.order),
            with: {
              lessons: {
                orderBy: asc(lessons.order),
                with: {
                  videos: {
                    orderBy: asc(videos.path),
                    with: {
                      clips: {
                        orderBy: asc(clips.order),
                        where: eq(clips.archived, false),
                      },
                    },
                  },
                },
              },
            },
          })
        );

        versionsWithStructure.push({
          id: version.id,
          name: version.name,
          description: version.description,
          createdAt: version.createdAt,
          sections: versionSections.map((s) => ({
            id: s.id,
            path: s.path,
            previousVersionSectionId: s.previousVersionSectionId,
            lessons: s.lessons
              .filter((l) => l.fsStatus !== "ghost")
              .map((l) => ({
                id: l.id,
                path: l.path,
                previousVersionLessonId: l.previousVersionLessonId,
                videos: l.videos.map((v) => ({
                  id: v.id,
                  path: v.path,
                  clips: v.clips.map((c) => ({
                    id: c.id,
                    text: c.text,
                  })),
                })),
              })),
          })),
        });
      }

      return versionsWithStructure;
    }
  );

  return {
    getRepoVersions,
    getLatestRepoVersion,
    getRepoVersionById,
    getRepoWithSectionsByVersion,
    getVersionWithSections,
    createRepoVersion,
    updateRepoVersion,
    deleteRepoVersion,
    copyVersionStructure,
    getVideoIdsForVersion,
    getAllVersionsWithStructure,
  };
};
