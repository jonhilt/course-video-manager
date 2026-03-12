import { useCallback, useMemo } from "react";
import type { FetcherWithComponents } from "react-router";
import {
  COURSE_STRUCTURE_STORAGE_KEY,
  MEMORY_ENABLED_STORAGE_KEY,
} from "./write-utils";

export function useVideoContextHandlers({
  videoId,
  transcript,
  isStandalone,
  openFolderFetcher,
  deleteLinkFetcher,
  setIncludeCourseStructure,
  setPreviewFilePath,
  setIsPreviewModalOpen,
  setIsPasteModalOpen,
  setIsLessonPasteModalOpen,
  setFileToDelete,
  setIsDeleteModalOpen,
  setIsAddLinkModalOpen,
  setMemoryEnabled,
}: {
  videoId: string;
  transcript: string;
  isStandalone: boolean;
  openFolderFetcher: FetcherWithComponents<unknown>;
  deleteLinkFetcher: FetcherWithComponents<unknown>;
  setIncludeCourseStructure: (v: boolean) => void;
  setPreviewFilePath: (v: string) => void;
  setIsPreviewModalOpen: (v: boolean) => void;
  setIsPasteModalOpen: (v: boolean) => void;
  setIsLessonPasteModalOpen: (v: boolean) => void;
  setFileToDelete: (v: string) => void;
  setIsDeleteModalOpen: (v: boolean) => void;
  setIsAddLinkModalOpen: (v: boolean) => void;
  setMemoryEnabled: (v: boolean) => void;
}) {
  const handleCopyTranscript = useCallback(
    () => navigator.clipboard.writeText(transcript),
    [transcript]
  );

  const handleIncludeCourseStructureChange = useCallback(
    (checked: boolean) => {
      setIncludeCourseStructure(checked);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(COURSE_STRUCTURE_STORAGE_KEY, String(checked));
      }
    },
    [setIncludeCourseStructure]
  );

  const handleFileClick = useCallback(
    (filePath: string) => {
      setPreviewFilePath(filePath);
      setIsPreviewModalOpen(true);
    },
    [setPreviewFilePath, setIsPreviewModalOpen]
  );

  const handleOpenFolderClick = useCallback(() => {
    openFolderFetcher.submit(null, {
      method: "post",
      action: `/api/videos/${videoId}/open-folder`,
    });
  }, [videoId, openFolderFetcher]);

  const handleAddFromClipboardClick = useMemo(
    () =>
      isStandalone
        ? () => setIsPasteModalOpen(true)
        : () => setIsLessonPasteModalOpen(true),
    [isStandalone, setIsPasteModalOpen, setIsLessonPasteModalOpen]
  );

  const handleDeleteFile = useCallback(
    (filename: string) => {
      setFileToDelete(filename);
      setIsDeleteModalOpen(true);
    },
    [setFileToDelete, setIsDeleteModalOpen]
  );

  const handleDeleteLink = useCallback(
    (linkId: string) => {
      deleteLinkFetcher.submit(null, {
        method: "post",
        action: `/api/links/${linkId}/delete`,
      });
    },
    [deleteLinkFetcher]
  );

  const handleAddLinkClick = useCallback(
    () => setIsAddLinkModalOpen(true),
    [setIsAddLinkModalOpen]
  );

  const handleMemoryEnabledChange = useCallback(
    (enabled: boolean) => {
      setMemoryEnabled(enabled);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(MEMORY_ENABLED_STORAGE_KEY, String(enabled));
      }
    },
    [setMemoryEnabled]
  );

  return {
    handleCopyTranscript,
    handleIncludeCourseStructureChange,
    handleFileClick,
    handleOpenFolderClick,
    handleAddFromClipboardClick,
    handleDeleteFile,
    handleDeleteLink,
    handleAddLinkClick,
    handleMemoryEnabledChange,
  };
}
