import type { DB } from "@/db/schema";
import type {
  ClipReducerAction,
  ClipReducerEffect,
  ClipReducerState,
  DatabaseId,
} from "@/features/video-editor/clip-state-reducer";
import {
  INSERTION_POINT_ID,
  RECORDING_SESSION_PANELS_ID,
} from "@/features/video-editor/constants";
import type { ClipService } from "@/services/clip-service";
import type { EffectsMap } from "use-effect-reducer";
import type React from "react";

export interface EditEffectHandlersDeps {
  videoId: string;
  clipService: ClipService;
  clipStateRef: React.RefObject<ClipReducerState>;
  speechDetectorStateRef: React.RefObject<{ type: string }>;
  revalidate: () => void;
  whiteNoiseAssetPath: string;
}

export function createEditEffectHandlers(
  deps: EditEffectHandlersDeps
): EffectsMap<ClipReducerState, ClipReducerAction, ClipReducerEffect> {
  const {
    videoId,
    clipService,
    clipStateRef,
    speechDetectorStateRef,
    revalidate,
    whiteNoiseAssetPath,
  } = deps;

  return {
    "archive-clips": (_state, effect, dispatch) => {
      clipService.archiveClips(effect.clipIds).catch((error) => {
        dispatch({
          type: "effect-failed",
          effectType: "archive-clips",
          message:
            error instanceof Error ? error.message : "Failed to archive clips",
        });
      });
    },
    "unarchive-clips": (_state, effect, dispatch) => {
      clipService.unarchiveClips(effect.clipIds).catch((error) => {
        dispatch({
          type: "effect-failed",
          effectType: "unarchive-clips",
          message:
            error instanceof Error
              ? error.message
              : "Failed to unarchive clips",
        });
      });
    },
    "transcribe-clips": (_state, effect, dispatch) => {
      fetch("/clips/transcribe", {
        method: "POST",
        body: JSON.stringify({ clipIds: effect.clipIds }),
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .then((clips: DB.Clip[]) => {
          dispatch({
            type: "clips-transcribed",
            clips: clips.map((clip) => ({
              databaseId: clip.id,
              text: clip.text,
            })),
          });
        })
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "transcribe-clips",
            message:
              error instanceof Error
                ? error.message
                : "Failed to transcribe clips",
          });
        });
    },
    "scroll-to-insertion-point": () => {
      const recordingPanel = document.querySelector("[data-session-recording]");
      if (recordingPanel) {
        recordingPanel.scrollIntoView({ behavior: "smooth", block: "end" });
        return;
      }
      const sessionPanels = document.getElementById(
        RECORDING_SESSION_PANELS_ID
      );
      if (sessionPanels) {
        sessionPanels.scrollIntoView({ behavior: "smooth", block: "end" });
        return;
      }
      const insertionPoint = document.getElementById(INSERTION_POINT_ID);
      if (insertionPoint) {
        insertionPoint.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    },
    "update-clips": (_state, effect, dispatch) => {
      // Transform tuple format [id, { scene, profile, beatType }] to UpdateClipInput
      const clipsInput = effect.clips.map(([id, data]) => ({
        id,
        scene: data.scene,
        profile: data.profile,
        beatType: data.beatType,
      }));
      clipService.updateClips(clipsInput).catch((error) => {
        dispatch({
          type: "effect-failed",
          effectType: "update-clips",
          message:
            error instanceof Error ? error.message : "Failed to update clips",
        });
      });
    },
    "update-beat": (_state, effect, dispatch) => {
      clipService.updateBeat(effect.clipId, effect.beatType).catch((error) => {
        dispatch({
          type: "effect-failed",
          effectType: "update-beat",
          message:
            error instanceof Error ? error.message : "Failed to update beat",
        });
      });
    },
    "reorder-clip": (_state, effect, dispatch) => {
      clipService
        .reorderClip(effect.clipId, effect.direction)
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "reorder-clip",
            message:
              error instanceof Error ? error.message : "Failed to reorder clip",
          });
        });
    },
    "reorder-clip-section": (_state, effect, dispatch) => {
      clipService
        .reorderClipSection(effect.clipSectionId, effect.direction)
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "reorder-clip-section",
            message:
              error instanceof Error
                ? error.message
                : "Failed to reorder clip section",
          });
        });
    },
    "archive-clip-sections": (_state, effect, dispatch) => {
      clipService.archiveClipSections(effect.clipSectionIds).catch((error) => {
        dispatch({
          type: "effect-failed",
          effectType: "archive-clip-sections",
          message:
            error instanceof Error
              ? error.message
              : "Failed to archive clip sections",
        });
      });
    },
    "create-clip-section": (state, effect, dispatch) => {
      clipService
        .createClipSectionAtInsertionPoint({
          videoId,
          name: effect.name,
          insertionPoint: effect.insertionPoint,
          items: state.items,
        })
        .then((clipSection) => {
          dispatch({
            type: "clip-section-created",
            frontendId: effect.frontendId,
            databaseId: clipSection.id as DatabaseId,
          });
        })
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "create-clip-section",
            message:
              error instanceof Error
                ? error.message
                : "Failed to create clip section",
          });
        });
    },
    "update-clip-section": (_state, effect, dispatch) => {
      clipService
        .updateClipSection(effect.clipSectionId, effect.name)
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "update-clip-section",
            message:
              error instanceof Error
                ? error.message
                : "Failed to update clip section",
          });
        });
    },
    "start-session-timeout": (_state, effect, dispatch) => {
      const timeout = setTimeout(() => {
        dispatch({
          type: "session-polling-complete",
          sessionId: effect.sessionId,
        });
      }, 10_000);

      return () => {
        clearTimeout(timeout);
      };
    },
    "start-session-polling": (_state, effect, dispatch) => {
      let unmounted = false;
      const FAST_INTERVAL = 500;
      const SLOW_INTERVAL = 2000;
      let consecutiveEmptyPolls = 0;

      (async () => {
        while (!unmounted) {
          // Stop polling when session is done
          const session = clipStateRef.current.sessions.find(
            (s) => s.id === effect.sessionId
          );
          if (session?.status === "done") {
            break;
          }

          // Skip polling while actively speaking — no new silence boundary yet
          const speechState = speechDetectorStateRef.current.type;
          if (
            speechState === "speaking-detected" ||
            speechState === "long-enough-speaking-for-clip-detected"
          ) {
            await new Promise((resolve) => setTimeout(resolve, FAST_INTERVAL));
            continue;
          }

          try {
            const { insertionPoint, items } = clipStateRef.current;
            const clips = await clipService.appendFromObs({
              videoId,
              filePath: effect.outputPath,
              insertionPoint,
              items,
            });
            if (clips.length > 0) {
              dispatch({
                type: "new-database-clips",
                clips: clips as DB.Clip[],
                outputPath: effect.outputPath,
              });
              consecutiveEmptyPolls = 0;
            } else {
              consecutiveEmptyPolls++;
            }
          } catch (e) {
            // Errors are swallowed; polling continues
          }

          // Back off when idle: after 3 empty polls, slow down
          const interval =
            consecutiveEmptyPolls > 3 ? SLOW_INTERVAL : FAST_INTERVAL;
          await new Promise((resolve) => setTimeout(resolve, interval));
        }
      })();

      return () => {
        unmounted = true;
      };
    },
    "create-clip-section-at": (_state, effect, dispatch) => {
      clipService
        .createClipSectionAtPosition({
          videoId,
          name: effect.name,
          position: effect.position,
          targetItemId: effect.targetItemId,
          targetItemType: effect.targetItemType,
        })
        .then((clipSection) => {
          dispatch({
            type: "clip-section-created",
            frontendId: effect.frontendId,
            databaseId: clipSection.id as DatabaseId,
          });
        })
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "create-clip-section-at",
            message:
              error instanceof Error
                ? error.message
                : "Failed to create clip section at position",
          });
        });
    },
    "create-effect-clip-at": (_state, effect, dispatch) => {
      clipService
        .createEffectClipAtPosition({
          videoId,
          position: effect.position,
          targetItemId: effect.targetItemId,
          targetItemType: effect.targetItemType,
          videoFilename: whiteNoiseAssetPath,
          sourceStartTime: effect.sourceStartTime,
          sourceEndTime: effect.sourceEndTime,
          text: effect.text,
          scene: effect.scene,
          profile: effect.profile,
          beatType: effect.beatType,
        })
        .then((clip) => {
          dispatch({
            type: "effect-clip-created",
            frontendId: effect.frontendId,
            databaseId: clip.id as DatabaseId,
          });
        })
        .catch((error) => {
          dispatch({
            type: "effect-failed",
            effectType: "create-effect-clip-at",
            message:
              error instanceof Error
                ? error.message
                : "Failed to create effect clip",
          });
        });
    },
    "revalidate-loader": () => {
      revalidate();
    },
  };
}
