import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { isLeftClick } from "@/lib/utils";
import { formatSecondsToTimeCode } from "@/services/utils";
import { courseViewReducer } from "@/features/course-view/course-view-reducer";
import {
  ArrowRightLeft,
  Download,
  FileVideo,
  FileX,
  FolderOpen,
  PencilIcon,
  Play,
  Trash2,
} from "lucide-react";
import { useNavigate, useFetcher } from "react-router";
import type { LoaderData, Section, Lesson, Video } from "./course-view-types";

function VideoThumbnailItem({
  video,
  section,
  lesson,
  data,
  navigate,
  dispatch,
  startExportUpload,
  revealVideoFetcher,
  deleteVideoFileFetcher,
  deleteVideoFetcher,
}: {
  video: Video;
  section: Section;
  lesson: Lesson;
  data: LoaderData;
  navigate: ReturnType<typeof useNavigate>;
  dispatch: (action: courseViewReducer.Action) => void;
  startExportUpload: (videoId: string, path: string) => void;
  revealVideoFetcher: ReturnType<typeof useFetcher>;
  deleteVideoFileFetcher: ReturnType<typeof useFetcher>;
  deleteVideoFetcher: ReturnType<typeof useFetcher>;
}) {
  const totalDuration = video.clips.reduce((acc, clip) => {
    return acc + (clip.sourceEndTime - clip.sourceStartTime);
  }, 0);

  const firstClip = video.clips[0];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          className="flex flex-col text-left group/thumb w-full"
          onMouseDown={(e) => {
            if (!isLeftClick(e)) return;
            navigate(`/videos/${video.id}/edit`);
          }}
        >
          <div className="relative aspect-[16/9] w-full rounded overflow-hidden bg-muted">
            {firstClip ? (
              <img
                src={`/clips/${firstClip.id}/first-frame`}
                alt={video.path}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <FileVideo className="w-6 h-6 text-muted-foreground/40" />
              </div>
            )}
            <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-mono px-1 py-0.5 rounded leading-none">
              {formatSecondsToTimeCode(totalDuration)}
            </div>
            {!data.hasExportedVideoMap[video.id] && (
              <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-red-500" />
            )}
          </div>
          <span className="text-xs text-muted-foreground truncate mt-1 group-hover/thumb:text-foreground transition-colors w-full">
            {video.path}
          </span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() => {
            dispatch({
              type: "open-video-player",
              videoId: video.id,
              videoPath: `${section.path}/${lesson.path}/${video.path}`,
            });
          }}
        >
          <Play className="w-4 h-4" />
          Play Video
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            startExportUpload(
              video.id,
              `${section.path}/${lesson.path}/${video.path}`
            );
          }}
        >
          <Download className="w-4 h-4" />
          Export
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            revealVideoFetcher.submit(
              {},
              {
                method: "post",
                action: `/api/videos/${video.id}/reveal`,
              }
            );
          }}
        >
          <FolderOpen className="w-4 h-4" />
          Reveal in File System
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            dispatch({
              type: "open-rename-video",
              videoId: video.id,
              videoPath: video.path,
            });
          }}
        >
          <PencilIcon className="w-4 h-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            dispatch({
              type: "open-move-video",
              videoId: video.id,
              videoPath: video.path,
              currentLessonId: lesson.id,
            });
          }}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Move to Lesson
        </ContextMenuItem>
        {data.hasExportedVideoMap[video.id] && (
          <ContextMenuItem
            variant="destructive"
            onSelect={() => {
              deleteVideoFileFetcher.submit(
                {},
                {
                  method: "post",
                  action: `/api/videos/${video.id}/delete-file`,
                }
              );
            }}
          >
            <FileX className="w-4 h-4" />
            Delete from File System
          </ContextMenuItem>
        )}
        <ContextMenuItem
          variant="destructive"
          onSelect={() => {
            deleteVideoFetcher.submit(
              { videoId: video.id },
              {
                method: "post",
                action: "/api/videos/delete",
              }
            );
          }}
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function VideoThumbnailGrid({
  videos,
  section,
  lesson,
  data,
  navigate,
  dispatch,
  startExportUpload,
  revealVideoFetcher,
  deleteVideoFileFetcher,
  deleteVideoFetcher,
}: {
  videos: Video[];
  section: Section;
  lesson: Lesson;
  data: LoaderData;
  navigate: ReturnType<typeof useNavigate>;
  dispatch: (action: courseViewReducer.Action) => void;
  startExportUpload: (videoId: string, path: string) => void;
  revealVideoFetcher: ReturnType<typeof useFetcher>;
  deleteVideoFileFetcher: ReturnType<typeof useFetcher>;
  deleteVideoFetcher: ReturnType<typeof useFetcher>;
}) {
  if (videos.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {videos.map((video) => (
        <VideoThumbnailItem
          key={video.id}
          video={video}
          section={section}
          lesson={lesson}
          data={data}
          navigate={navigate}
          dispatch={dispatch}
          startExportUpload={startExportUpload}
          revealVideoFetcher={revealVideoFetcher}
          deleteVideoFileFetcher={deleteVideoFileFetcher}
          deleteVideoFetcher={deleteVideoFetcher}
        />
      ))}
    </div>
  );
}
