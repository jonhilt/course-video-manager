import {
  createContext,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { toast } from "sonner";
import { uploadReducer, createInitialUploadState } from "./upload-reducer";
import { startSSEUpload } from "./sse-upload-client";

export interface UploadContextType {
  uploads: uploadReducer.State["uploads"];
  startUpload: (
    videoId: string,
    title: string,
    description: string,
    privacyStatus: "public" | "unlisted"
  ) => string;
  dismissUpload: (uploadId: string) => void;
}

export const UploadContext = createContext<UploadContextType>(null!);

let nextUploadId = 0;
const generateUploadId = () => `upload-${++nextUploadId}`;

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(
    uploadReducer,
    undefined,
    createInitialUploadState
  );

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const previousUploadsRef = useRef<uploadReducer.State["uploads"]>({});

  // Stores description + privacyStatus for retries (reducer only tracks videoId/title)
  const uploadParamsRef = useRef<
    Map<string, { description: string; privacyStatus: "public" | "unlisted" }>
  >(new Map());

  const initiateSSEConnection = useCallback(
    (
      uploadId: string,
      videoId: string,
      title: string,
      description: string,
      privacyStatus: "public" | "unlisted"
    ) => {
      const existing = abortControllersRef.current.get(uploadId);
      if (existing) {
        existing.abort();
      }

      const abortController = startSSEUpload(
        { videoId, title, description, privacyStatus },
        {
          onProgress: (percentage) => {
            dispatch({
              type: "UPDATE_PROGRESS",
              uploadId,
              progress: percentage,
            });
          },
          onComplete: (youtubeVideoId) => {
            dispatch({
              type: "UPLOAD_SUCCESS",
              uploadId,
              youtubeVideoId,
            });
            abortControllersRef.current.delete(uploadId);
          },
          onError: (message) => {
            dispatch({
              type: "UPLOAD_ERROR",
              uploadId,
              errorMessage: message,
            });
            abortControllersRef.current.delete(uploadId);
          },
        }
      );

      abortControllersRef.current.set(uploadId, abortController);
    },
    []
  );

  const startUpload = useCallback(
    (
      videoId: string,
      title: string,
      description: string,
      privacyStatus: "public" | "unlisted"
    ) => {
      const uploadId = generateUploadId();

      uploadParamsRef.current.set(uploadId, { description, privacyStatus });

      dispatch({
        type: "START_UPLOAD",
        uploadId,
        videoId,
        title,
      });

      initiateSSEConnection(
        uploadId,
        videoId,
        title,
        description,
        privacyStatus
      );

      return uploadId;
    },
    [initiateSSEConnection]
  );

  const dismissUpload = useCallback((uploadId: string) => {
    const abortController = abortControllersRef.current.get(uploadId);
    if (abortController) {
      abortController.abort();
      abortControllersRef.current.delete(uploadId);
    }
    uploadParamsRef.current.delete(uploadId);
    dispatch({ type: "DISMISS", uploadId });
  }, []);

  // Single effect: watch for status transitions to fire toasts and handle auto-retry
  useEffect(() => {
    const prev = previousUploadsRef.current;
    const current = state.uploads;

    for (const [uploadId, upload] of Object.entries(current)) {
      const prevUpload = prev[uploadId];
      if (!prevUpload) continue;
      if (prevUpload.status === upload.status) continue;

      if (upload.status === "success") {
        const youtubeStudioUrl = `https://studio.youtube.com/video/${upload.youtubeVideoId}/edit`;
        const postUrl = `/videos/${upload.videoId}/post`;

        toast.success(`"${upload.title}" uploaded to YouTube`, {
          duration: Infinity,
          action: {
            label: "YouTube Studio",
            onClick: () => window.open(youtubeStudioUrl, "_blank"),
          },
          cancel: {
            label: "Go to Post",
            onClick: () => {
              window.location.href = postUrl;
            },
          },
        });
      }

      if (upload.status === "error") {
        const postUrl = `/videos/${upload.videoId}/post`;

        toast.error(`"${upload.title}" upload failed: ${upload.errorMessage}`, {
          duration: Infinity,
          cancel: {
            label: "Go to Post",
            onClick: () => {
              window.location.href = postUrl;
            },
          },
        });
      }

      if (upload.status === "retrying") {
        // Auto-retry: reset to uploading and re-initiate SSE connection
        dispatch({ type: "RETRY", uploadId });

        const params = uploadParamsRef.current.get(uploadId);
        if (params) {
          initiateSSEConnection(
            uploadId,
            upload.videoId,
            upload.title,
            params.description,
            params.privacyStatus
          );
        }
      }
    }

    previousUploadsRef.current = current;
  }, [state.uploads, initiateSSEConnection]);

  // Clean up abort controllers on unmount
  useEffect(() => {
    return () => {
      for (const controller of abortControllersRef.current.values()) {
        controller.abort();
      }
    };
  }, []);

  return (
    <UploadContext.Provider
      value={{
        uploads: state.uploads,
        startUpload,
        dismissUpload,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}
