"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileTree } from "@/components/FileTree";
import { StandaloneFileTree } from "@/components/StandaloneFileTree";
import { ClipboardIcon, FolderOpenIcon } from "lucide-react";
import type { FileMetadata } from "@/components/video-context-panel";

export function FileSection({
  files,
  enabledFiles,
  onEnabledFilesChange,
  onFileClick,
  onOpenFolderClick,
  onAddFromClipboardClick,
  isStandalone,
  onEditFile,
  onDeleteFile,
}: {
  files: FileMetadata[];
  enabledFiles: Set<string>;
  onEnabledFilesChange: (files: Set<string>) => void;
  onFileClick?: (filePath: string) => void;
  onOpenFolderClick?: () => void;
  onAddFromClipboardClick?: () => void;
  isStandalone: boolean;
  onEditFile?: (filename: string) => void;
  onDeleteFile?: (filename: string) => void;
}) {
  const checkboxId = isStandalone
    ? "include-standalone-files"
    : "include-files";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 py-1 px-2">
        <Checkbox
          id={checkboxId}
          checked={
            files.length === 0
              ? false
              : enabledFiles.size === files.length
                ? true
                : enabledFiles.size > 0
                  ? "indeterminate"
                  : false
          }
          onCheckedChange={(checked) => {
            if (checked) {
              onEnabledFilesChange(new Set(files.map((f) => f.path)));
            } else {
              onEnabledFilesChange(new Set());
            }
          }}
        />
        <label htmlFor={checkboxId} className="text-sm flex-1 cursor-pointer">
          Files
        </label>
        {onOpenFolderClick && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onOpenFolderClick}
            title="Open folder"
          >
            <FolderOpenIcon className="h-3.5 w-3.5" />
          </Button>
        )}
        {onAddFromClipboardClick && (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={onAddFromClipboardClick}
          >
            <ClipboardIcon className="h-3 w-3 mr-1" />
            Add from Clipboard
          </Button>
        )}
      </div>
      {isStandalone ? (
        <StandaloneFileTree
          files={files}
          enabledFiles={enabledFiles}
          onEnabledFilesChange={onEnabledFilesChange}
          onEditFile={onEditFile ?? (() => {})}
          onDeleteFile={onDeleteFile ?? (() => {})}
          onFileClick={onFileClick}
        />
      ) : (
        <FileTree
          files={files}
          enabledFiles={enabledFiles}
          onEnabledFilesChange={onEnabledFilesChange}
          onFileClick={onFileClick}
        />
      )}
    </div>
  );
}
