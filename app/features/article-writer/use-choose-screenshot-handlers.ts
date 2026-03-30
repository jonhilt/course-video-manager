import { useCallback, type RefObject } from "react";
import {
  replaceChooseScreenshotWithImage,
  updateChooseScreenshotClipIndex,
  removeChooseScreenshot,
} from "./choose-screenshot-mutations";

export function useChooseScreenshotHandlers({
  videoId,
  documentRef,
  updateDocument,
  dispatch,
}: {
  videoId: string;
  documentRef: RefObject<string | undefined>;
  updateDocument: (content: string) => void;
  dispatch: (action: {
    type: "set-doc-capturing-key";
    key: string | null;
  }) => void;
}) {
  const handleDocCapture = useCallback(
    async (
      clipIndex: number,
      alt: string,
      timestamp: number,
      videoFilename: string
    ) => {
      const key = `doc-${clipIndex}-${alt}`;
      dispatch({ type: "set-doc-capturing-key", key });
      try {
        const res = await fetch(`/api/videos/${videoId}/capture-screenshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timestamp, videoFilename }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to capture screenshot");
        }
        const { imagePath } = await res.json();
        const currentDoc = documentRef.current;
        if (currentDoc) {
          updateDocument(
            replaceChooseScreenshotWithImage(
              currentDoc,
              clipIndex,
              alt,
              imagePath
            )
          );
        }
      } catch (err) {
        console.error("Screenshot capture failed:", err);
      } finally {
        dispatch({ type: "set-doc-capturing-key", key: null });
      }
    },
    [videoId, documentRef, updateDocument]
  );

  const handleDocClipIndexChange = useCallback(
    (currentIndex: number, newIndex: number, alt: string) => {
      const currentDoc = documentRef.current;
      if (currentDoc) {
        updateDocument(
          updateChooseScreenshotClipIndex(
            currentDoc,
            currentIndex,
            newIndex,
            alt
          )
        );
      }
    },
    [documentRef, updateDocument]
  );

  const handleDocRemove = useCallback(
    (clipIndex: number, alt: string) => {
      const currentDoc = documentRef.current;
      if (currentDoc) {
        updateDocument(removeChooseScreenshot(currentDoc, clipIndex, alt));
      }
    },
    [documentRef, updateDocument]
  );

  return { handleDocCapture, handleDocClipIndexChange, handleDocRemove };
}
