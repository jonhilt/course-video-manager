import { useCallback, useState, type MutableRefObject } from "react";
import { useFetcher } from "react-router";
import { marked } from "marked";
import { toast } from "sonner";

export function useDocumentPanelActions({
  videoId,
  documentRef,
  updateDocument,
  lessonId,
  setIsCopied,
}: {
  videoId: string;
  documentRef: MutableRefObject<string | undefined>;
  updateDocument: (content: string) => void;
  lessonId: string | null;
  setIsCopied: (v: boolean) => void;
}) {
  const writeToReadmeFetcher = useFetcher();

  // Cloudinary image upload
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  const handleUploadImages = useCallback(async () => {
    const currentDoc = documentRef.current;
    if (!currentDoc?.trim()) return;
    setIsUploadingImages(true);
    try {
      const response = await fetch(`/api/videos/${videoId}/upload-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: currentDoc }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to upload images");
      }
      const result = await response.json();
      if (result.body !== currentDoc) {
        updateDocument(result.body);
        toast.success("Images uploaded to Cloudinary");
      } else {
        toast("No local images found to upload");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to upload images"
      );
    } finally {
      setIsUploadingImages(false);
    }
  }, [videoId, documentRef, updateDocument]);

  // Copy handlers (read from document, not last message)
  const handleCopyAsMarkdown = useCallback(async () => {
    const currentDoc = documentRef.current;
    if (!currentDoc) return;
    try {
      await navigator.clipboard.writeText(currentDoc);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  }, [documentRef, setIsCopied]);

  const handleCopyAsRichText = useCallback(async () => {
    const currentDoc = documentRef.current;
    if (!currentDoc) return;
    try {
      const html = await marked.parse(currentDoc);
      const blob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([currentDoc], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": blob, "text/plain": textBlob }),
      ]);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy as rich text:", error);
    }
  }, [documentRef, setIsCopied]);

  // Write to readme handler
  const handleWriteToReadme = useCallback(
    (writeMode: "write" | "append") => {
      const currentDoc = documentRef.current;
      if (!currentDoc) return;
      writeToReadmeFetcher.submit(
        { lessonId, content: currentDoc, mode: writeMode },
        {
          method: "POST",
          action: "/api/write-readme",
          encType: "application/json",
        }
      );
    },
    [documentRef, writeToReadmeFetcher, lessonId]
  );

  return {
    writeToReadmeFetcher,
    isUploadingImages,
    handleUploadImages,
    handleCopyAsMarkdown,
    handleCopyAsRichText,
    handleWriteToReadme,
  };
}
