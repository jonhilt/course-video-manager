import { useCallback } from "react";
import type { uploadReducer } from "./upload-reducer";
import { startSSEUpload } from "./sse-upload-client";
import { startSSESocialPost } from "./sse-social-client";
import { startSSEAiHeroPost } from "./sse-ai-hero-client";
import { startSSEBlogPost } from "./sse-blog-client";
import { startSSEExport } from "./sse-export-client";
import { startSSEDropboxPublish } from "./sse-dropbox-publish-client";
import { startSSEPublish } from "./sse-publish-client";

type Dispatch = React.Dispatch<uploadReducer.Action>;

export const useSSEConnections = (
  dispatch: Dispatch,
  abortControllersRef: React.RefObject<Map<string, AbortController>>
) => {
  const abortExisting = (uploadId: string) => {
    const existing = abortControllersRef.current.get(uploadId);
    if (existing) existing.abort();
  };

  const trackController = (uploadId: string, controller: AbortController) => {
    abortControllersRef.current.set(uploadId, controller);
  };

  const removeController = (uploadId: string) => {
    abortControllersRef.current.delete(uploadId);
  };

  const initiateSSEConnection = useCallback(
    (
      uploadId: string,
      videoId: string,
      title: string,
      description: string,
      privacyStatus: "public" | "unlisted"
    ) => {
      abortExisting(uploadId);
      const controller = startSSEUpload(
        { videoId, title, description, privacyStatus },
        {
          onProgress: (percentage) =>
            dispatch({
              type: "UPDATE_PROGRESS",
              uploadId,
              progress: percentage,
            }),
          onComplete: (youtubeVideoId) => {
            dispatch({ type: "UPLOAD_SUCCESS", uploadId, youtubeVideoId });
            removeController(uploadId);
          },
          onError: (message) => {
            dispatch({ type: "UPLOAD_ERROR", uploadId, errorMessage: message });
            removeController(uploadId);
          },
        }
      );
      trackController(uploadId, controller);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const initiateSSESocialConnection = useCallback(
    (uploadId: string, videoId: string, caption: string) => {
      abortExisting(uploadId);
      const controller = startSSESocialPost(
        { videoId, caption },
        {
          onProgress: (percentage) =>
            dispatch({
              type: "UPDATE_PROGRESS",
              uploadId,
              progress: percentage,
            }),
          onStageChange: (stage) =>
            dispatch({ type: "UPDATE_BUFFER_STAGE", uploadId, stage }),
          onComplete: () => {
            dispatch({ type: "UPLOAD_SUCCESS", uploadId });
            removeController(uploadId);
          },
          onError: (message) => {
            dispatch({ type: "UPLOAD_ERROR", uploadId, errorMessage: message });
            removeController(uploadId);
          },
        }
      );
      trackController(uploadId, controller);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const initiateSSEAiHeroConnection = useCallback(
    (
      uploadId: string,
      videoId: string,
      title: string,
      body: string,
      description: string,
      slug: string
    ) => {
      abortExisting(uploadId);
      const controller = startSSEAiHeroPost(
        { videoId, title, body, description, slug },
        {
          onProgress: (percentage) =>
            dispatch({
              type: "UPDATE_PROGRESS",
              uploadId,
              progress: percentage,
            }),
          onComplete: (aiHeroSlug) => {
            dispatch({ type: "UPLOAD_SUCCESS", uploadId, aiHeroSlug });
            removeController(uploadId);
          },
          onError: (message) => {
            dispatch({ type: "UPLOAD_ERROR", uploadId, errorMessage: message });
            removeController(uploadId);
          },
        }
      );
      trackController(uploadId, controller);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const initiateSSEBlogConnection = useCallback(
    (
      uploadId: string,
      videoId: string,
      title: string,
      body: string,
      description: string,
      slug: string
    ) => {
      abortExisting(uploadId);
      const controller = startSSEBlogPost(
        { videoId, title, body, description, slug },
        {
          onProgress: (percentage) =>
            dispatch({
              type: "UPDATE_PROGRESS",
              uploadId,
              progress: percentage,
            }),
          onComplete: (blogSlug) => {
            dispatch({ type: "UPLOAD_SUCCESS", uploadId, blogSlug });
            removeController(uploadId);
          },
          onError: (message) => {
            dispatch({ type: "UPLOAD_ERROR", uploadId, errorMessage: message });
            removeController(uploadId);
          },
        }
      );
      trackController(uploadId, controller);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const initiateSSEExportConnection = useCallback(
    (uploadId: string, videoId: string) => {
      abortExisting(uploadId);
      const controller = startSSEExport(
        { videoId },
        {
          onStageChange: (stage) =>
            dispatch({ type: "UPDATE_EXPORT_STAGE", uploadId, stage }),
          onComplete: () => {
            dispatch({ type: "UPLOAD_SUCCESS", uploadId });
            removeController(uploadId);
          },
          onError: (message) => {
            dispatch({ type: "UPLOAD_ERROR", uploadId, errorMessage: message });
            removeController(uploadId);
          },
        }
      );
      trackController(uploadId, controller);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const initiateSSEDropboxPublishConnection = useCallback(
    (uploadId: string, repoId: string) => {
      abortExisting(uploadId);
      const controller = startSSEDropboxPublish(
        { repoId },
        {
          onProgress: (percentage) =>
            dispatch({
              type: "UPDATE_PROGRESS",
              uploadId,
              progress: percentage,
            }),
          onComplete: (missingVideoCount) => {
            if (missingVideoCount > 0) {
              dispatch({
                type: "UPDATE_DROPBOX_PUBLISH_MISSING_COUNT",
                uploadId,
                missingVideoCount,
              });
            }
            dispatch({ type: "UPLOAD_SUCCESS", uploadId });
            removeController(uploadId);
          },
          onError: (message) => {
            dispatch({ type: "UPLOAD_ERROR", uploadId, errorMessage: message });
            removeController(uploadId);
          },
        }
      );
      trackController(uploadId, controller);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const initiateSSEPublishConnection = useCallback(
    (uploadId: string, courseId: string, name: string, description: string) => {
      abortExisting(uploadId);
      const controller = startSSEPublish(
        { courseId, name, description },
        {
          onStageChange: (stage) =>
            dispatch({ type: "UPDATE_PUBLISH_STAGE", uploadId, stage }),
          onComplete: (result) => {
            dispatch({
              type: "PUBLISH_COMPLETE",
              uploadId,
              newDraftVersionId: result.newDraftVersionId,
            });
            dispatch({ type: "UPLOAD_SUCCESS", uploadId });
            removeController(uploadId);
          },
          onError: (message) => {
            dispatch({ type: "UPLOAD_ERROR", uploadId, errorMessage: message });
            removeController(uploadId);
          },
        }
      );
      trackController(uploadId, controller);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return {
    initiateSSEConnection,
    initiateSSESocialConnection,
    initiateSSEAiHeroConnection,
    initiateSSEBlogConnection,
    initiateSSEExportConnection,
    initiateSSEDropboxPublishConnection,
    initiateSSEPublishConnection,
  };
};
