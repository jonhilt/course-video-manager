import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { courseViewReducer } from "@/features/course-view/course-view-reducer";
import type { LoaderData } from "./course-view-types";
import {
  Archive,
  ChevronDown,
  Copy,
  Download,
  Film,
  FileText,
  FileX,
  GitBranch,
  Loader2,
  PencilIcon,
  Send,
  Trash2,
  FolderPen,
  ClipboardCopy,
} from "lucide-react";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";

export function ActionsDropdown({
  currentRepo,
  data,
  dispatch,
  publishRepoFetcher,
  archiveRepoFetcher,
  gitPushFetcher,
  handleBatchExport,
}: {
  currentRepo: NonNullable<LoaderData["selectedRepo"]>;
  data: LoaderData;
  dispatch: (action: courseViewReducer.Action) => void;
  publishRepoFetcher: ReturnType<typeof useFetcher>;
  archiveRepoFetcher: ReturnType<typeof useFetcher>;
  gitPushFetcher: ReturnType<typeof useFetcher>;
  handleBatchExport: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          disabled={publishRepoFetcher.state === "submitting"}
        >
          {publishRepoFetcher.state === "submitting" ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : null}
          Actions
          <ChevronDown className="w-4 h-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem
          disabled={!data.selectedVersion}
          onSelect={() => {
            handleBatchExport();
          }}
        >
          <Download className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span className="font-medium">Export</span>
            <span className="text-xs text-muted-foreground">
              Export videos not yet exported
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            publishRepoFetcher
              .submit(
                { repoId: currentRepo.id },
                {
                  method: "post",
                  action: "/api/repos/publish-to-dropbox",
                }
              )
              .then((data) => {
                const result = data as
                  | {
                      missingVideos: { videoId: string }[];
                    }
                  | undefined;
                const missingCount = result?.missingVideos?.length ?? 0;
                if (missingCount > 0) {
                  toast.warning(
                    `Published to Dropbox, but ${missingCount} video${missingCount === 1 ? " was" : "s were"} not exported`
                  );
                } else {
                  toast.success("Published to Dropbox");
                }
              })
              .catch((e) => {
                console.error("Publish failed", e);
                toast.error("Publish failed");
              });
          }}
        >
          <Send className="w-4 h-4 mr-2" />
          <div className="flex flex-col">
            <span className="font-medium">Publish</span>
            <span className="text-xs text-muted-foreground">
              Copy all files to Dropbox
            </span>
          </div>
        </DropdownMenuItem>

        {data.gitStatus && data.gitStatus.total > 0 && (
          <DropdownMenuItem
            disabled={gitPushFetcher.state === "submitting"}
            onSelect={() => {
              gitPushFetcher
                .submit(
                  {},
                  {
                    method: "post",
                    action: `/api/repos/${currentRepo.id}/git-push`,
                  }
                )
                .then(() => {
                  toast.success("Changes pushed to git");
                })
                .catch((e) => {
                  console.error("Git push failed", e);
                  toast.error("Git push failed");
                });
            }}
          >
            <GitBranch className="w-4 h-4 mr-2" />
            <div className="flex flex-col">
              <span className="font-medium">Push</span>
              <span className="text-xs text-muted-foreground">
                Add, commit & push {data.gitStatus.total} change
                {data.gitStatus.total !== 1 ? "s" : ""}
              </span>
            </div>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Course</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() =>
              dispatch({
                type: "set-rename-repo-modal-open",
                open: true,
              })
            }
          >
            <PencilIcon className="w-4 h-4 mr-2" />
            <div className="flex flex-col">
              <span className="font-medium">Rename Course</span>
              <span className="text-xs text-muted-foreground">
                Change course name
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              dispatch({
                type: "set-rewrite-repo-path-modal-open",
                open: true,
              })
            }
          >
            <FolderPen className="w-4 h-4 mr-2" />
            <div className="flex flex-col">
              <span className="font-medium">Rewrite Repo Path</span>
              <span className="text-xs text-muted-foreground">
                Change repository file path
              </span>
            </div>
          </DropdownMenuItem>
          {currentRepo.sections.some((s) =>
            s.lessons.some((l) => l.fsStatus !== "ghost" && l.videos.length > 0)
          ) && (
            <DropdownMenuItem
              onSelect={() =>
                dispatch({
                  type: "set-copy-transcript-modal-open",
                  open: true,
                })
              }
            >
              <ClipboardCopy className="w-4 h-4 mr-2" />
              <div className="flex flex-col">
                <span className="font-medium">Copy Course Transcript</span>
                <span className="text-xs text-muted-foreground">
                  Copy all transcripts to clipboard
                </span>
              </div>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              archiveRepoFetcher.submit(
                {
                  archived: currentRepo.archived ? "false" : "true",
                },
                {
                  method: "post",
                  action: `/api/repos/${currentRepo.id}/archive`,
                }
              );
            }}
          >
            <Archive className="w-4 h-4 mr-2" />
            <div className="flex flex-col">
              <span className="font-medium">
                {currentRepo.archived ? "Unarchive" : "Archive"} Course
              </span>
              <span className="text-xs text-muted-foreground">
                {currentRepo.archived
                  ? "Restore course to active repos"
                  : "Hide course from main view"}
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {data.selectedVersion && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Version</DropdownMenuLabel>
            <DropdownMenuGroup>
              {data.isLatestVersion && (
                <DropdownMenuItem
                  onSelect={() =>
                    dispatch({
                      type: "set-create-version-modal-open",
                      open: true,
                    })
                  }
                >
                  <Copy className="w-4 h-4 mr-2" />
                  <div className="flex flex-col">
                    <span className="font-medium">Create New Version</span>
                    <span className="text-xs text-muted-foreground">
                      Copy structure from current version
                    </span>
                  </div>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() =>
                  dispatch({
                    type: "set-edit-version-modal-open",
                    open: true,
                  })
                }
              >
                <PencilIcon className="w-4 h-4 mr-2" />
                <div className="flex flex-col">
                  <span className="font-medium">Edit Version</span>
                  <span className="text-xs text-muted-foreground">
                    Change version name and description
                  </span>
                </div>
              </DropdownMenuItem>
              {data.showMediaFilesList && (
                <DropdownMenuItem asChild>
                  <Link
                    to={`/repos/${currentRepo.id}/versions/${data.selectedVersion.id}/media-files`}
                  >
                    <Film className="w-4 h-4 mr-2" />
                    <div className="flex flex-col">
                      <span className="font-medium">View Media Files</span>
                      <span className="text-xs text-muted-foreground">
                        List source footage for clips
                      </span>
                    </div>
                  </Link>
                </DropdownMenuItem>
              )}
              {data.versions.length > 1 && (
                <DropdownMenuItem asChild>
                  <Link to={`/repos/${currentRepo.id}/changelog`}>
                    <FileText className="w-4 h-4 mr-2" />
                    <div className="flex flex-col">
                      <span className="font-medium">Preview Changelog</span>
                      <span className="text-xs text-muted-foreground">
                        View changes between versions
                      </span>
                    </div>
                  </Link>
                </DropdownMenuItem>
              )}
              {data.versions.length > 1 &&
                (() => {
                  const canDelete = data.isLatestVersion;
                  const disabledReason = !data.isLatestVersion
                    ? "Can only delete latest version"
                    : null;

                  const menuItem = (
                    <DropdownMenuItem
                      onSelect={() =>
                        canDelete &&
                        dispatch({
                          type: "set-delete-version-modal-open",
                          open: true,
                        })
                      }
                      disabled={!canDelete}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      <div className="flex flex-col">
                        <span className="font-medium">Delete Version</span>
                        <span className="text-xs text-muted-foreground">
                          Remove current version permanently
                        </span>
                      </div>
                    </DropdownMenuItem>
                  );

                  if (disabledReason) {
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>{menuItem}</div>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {disabledReason}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return menuItem;
                })()}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Storage</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() =>
                  dispatch({
                    type: "set-clear-video-files-modal-open",
                    open: true,
                  })
                }
                className="text-destructive focus:text-destructive"
              >
                <FileX className="w-4 h-4 mr-2" />
                <div className="flex flex-col">
                  <span className="font-medium">Clear Video Files</span>
                  <span className="text-xs text-muted-foreground">
                    Delete exported videos from file system
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
