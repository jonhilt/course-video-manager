import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import { Console, Effect } from "effect";
import { data } from "react-router";
import type { Route } from "./+types/videos.$videoId.thumbnails";
import {
  CameraIcon,
  ImageIcon,
  SaveIcon,
  Loader2Icon,
  ClipboardIcon,
  XIcon,
  Trash2Icon,
  PencilIcon,
  PlusIcon,
  ScissorsIcon,
  AlertCircleIcon,
} from "lucide-react";
import { useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CaptureCameraModal } from "@/components/capture-camera-modal";
import { useThumbnailReducer } from "@/hooks/use-thumbnail-reducer";
import {
  composeThumbnailLayers,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from "@/features/thumbnail-editor/canvas-compositor";

export const loader = async (args: Route.LoaderArgs) => {
  const { videoId } = args.params;
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const thumbnails = yield* db.getThumbnailsByVideoId(videoId);

    return { videoId, thumbnails };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

function YouTubePreview({
  src,
  width,
  height,
  label,
}: {
  src: string;
  width: number;
  height: number;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="relative" style={{ width, height }}>
        <img
          src={src}
          alt={`${label} preview`}
          className="rounded-lg object-cover"
          style={{ width, height }}
        />
        {/* Mock YouTube timestamp badge */}
        <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-xs font-medium leading-none text-white">
          12:34
        </div>
      </div>
    </div>
  );
}

export default function ThumbnailsPage({ loaderData }: Route.ComponentProps) {
  const { videoId, thumbnails } = loaderData;
  const { state, dispatch } = useThumbnailReducer(thumbnails);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw all layers onto the canvas compositor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state.capturedPhoto) {
      dispatch({ type: "preview-updated", dataUrl: null });
      return;
    }

    composeThumbnailLayers(canvas, {
      capturedPhoto: state.capturedPhoto,
      diagramImage: state.diagramImage,
      diagramPosition: state.diagramPosition,
      cutoutImage: state.cutoutImage,
      cutoutPosition: state.cutoutPosition,
    }).then((dataUrl) => {
      dispatch({ type: "preview-updated", dataUrl });
    });
  }, [
    state.capturedPhoto,
    state.diagramImage,
    state.diagramPosition,
    state.cutoutImage,
    state.cutoutPosition,
    dispatch,
  ]);

  // Handle clipboard paste for diagram images
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      if (!state.capturedPhoto) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || !item.type.startsWith("image/")) continue;

        const blob = item.getAsFile();
        if (blob) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            dispatch({
              type: "diagram-pasted",
              dataUrl: reader.result as string,
            });
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    },
    [state.capturedPhoto, dispatch]
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !state.capturedPhoto) return;

    dispatch({
      type: "save-requested",
      videoId,
      compositeDataUrl: canvas.toDataURL("image/png"),
    });
  };

  const handleDelete = (thumbnailId: string) => {
    if (!confirm("Delete this thumbnail?")) return;
    dispatch({ type: "delete-requested", thumbnailId });
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Thumbnails {thumbnails.length > 0 && `(${thumbnails.length})`}
        </h2>
        <Button onClick={() => dispatch({ type: "open-camera" })}>
          <CameraIcon />
          Capture Face
        </Button>
      </div>

      {state.capturedPhoto && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-gray-400">
            {state.editingThumbnailId ? "Editing Thumbnail" : "Canvas Preview"}
          </h3>
          <div className="inline-block overflow-hidden rounded-lg border">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="h-auto max-w-2xl w-full"
            />
          </div>
          {/* Layer controls */}
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-400">Layers</h3>

            {/* Background layer */}
            <div className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
              <ImageIcon className="size-4 text-gray-400" />
              <span>Background Photo</span>
            </div>

            {/* Diagram layer */}
            {state.diagramImage ? (
              <div className="rounded border px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ClipboardIcon className="size-4 text-gray-400" />
                    <span>Diagram</span>
                  </div>
                  <button
                    onClick={() => dispatch({ type: "diagram-removed" })}
                    className="text-gray-400 hover:text-gray-200"
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
                <div className="mt-2">
                  <Label className="text-xs text-gray-400">
                    Horizontal Position
                  </Label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={state.diagramPosition}
                    onChange={(e) =>
                      dispatch({
                        type: "diagram-position-changed",
                        value: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded border border-dashed px-3 py-2 text-sm text-gray-500">
                <ClipboardIcon className="size-4" />
                <span>Paste a diagram from clipboard (Ctrl+V)</span>
              </div>
            )}

            {/* Cutout layer */}
            {state.removingBackground ? (
              <div className="flex items-center gap-2 rounded border px-3 py-2 text-sm text-gray-400">
                <Loader2Icon className="size-4 animate-spin" />
                <span>Removing background...</span>
              </div>
            ) : state.backgroundRemovalError ? (
              <div className="rounded border border-red-800 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircleIcon className="size-4" />
                    <span>Cutout</span>
                  </div>
                  <button
                    onClick={() =>
                      dispatch({ type: "retry-background-removal" })
                    }
                    className="text-xs text-red-400 hover:text-red-300 underline"
                  >
                    Retry
                  </button>
                </div>
                <p className="mt-1 text-xs text-red-400/70">
                  {state.backgroundRemovalError}
                </p>
              </div>
            ) : state.cutoutImage ? (
              <div className="rounded border px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ScissorsIcon className="size-4 text-gray-400" />
                    <span>Cutout</span>
                  </div>
                  <button
                    onClick={() => dispatch({ type: "cutout-removed" })}
                    className="text-gray-400 hover:text-gray-200"
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
                <div className="mt-2">
                  <Label className="text-xs text-gray-400">
                    Horizontal Position
                  </Label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={state.cutoutPosition}
                    onChange={(e) =>
                      dispatch({
                        type: "cutout-position-changed",
                        value: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded border border-dashed px-3 py-2 text-sm text-gray-500">
                <ScissorsIcon className="size-4" />
                <span>No cutout layer</span>
              </div>
            )}
          </div>

          {/* YouTube size previews */}
          {state.previewDataUrl && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium text-gray-400">
                YouTube Previews
              </h3>
              <div className="flex items-end gap-4">
                <YouTubePreview
                  src={state.previewDataUrl}
                  width={360}
                  height={202}
                  label="Home Feed"
                />
                <YouTubePreview
                  src={state.previewDataUrl}
                  width={246}
                  height={138}
                  label="Search Results"
                />
                <YouTubePreview
                  src={state.previewDataUrl}
                  width={168}
                  height={94}
                  label="Sidebar"
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <Button onClick={handleSave} disabled={state.saving}>
              {state.saving ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SaveIcon />
              )}
              {state.saving
                ? "Saving..."
                : state.editingThumbnailId
                  ? "Update Thumbnail"
                  : "Save Thumbnail"}
            </Button>
            {state.editingThumbnailId && (
              <Button
                variant="outline"
                onClick={() => dispatch({ type: "new-thumbnail-clicked" })}
              >
                <PlusIcon />
                New Thumbnail
              </Button>
            )}
          </div>
        </div>
      )}

      {thumbnails.length === 0 && !state.capturedPhoto ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-4">
          <ImageIcon className="size-16 opacity-50" />
          <div className="text-center">
            <p className="text-lg font-medium">No thumbnails yet</p>
            <p className="text-sm mt-1">
              Capture a face photo to start creating thumbnails.
            </p>
          </div>
        </div>
      ) : (
        thumbnails.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-400">
              Saved Thumbnails
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {thumbnails.map((thumbnail) => (
                <div
                  key={thumbnail.id}
                  className={`group relative rounded-lg overflow-hidden cursor-pointer transition-all ${
                    state.editingThumbnailId === thumbnail.id
                      ? "ring-2 ring-blue-500 border border-blue-500"
                      : "border hover:border-gray-400"
                  }`}
                  onClick={() =>
                    dispatch({
                      type: "edit-requested",
                      thumbnailId: thumbnail.id,
                    })
                  }
                >
                  {thumbnail.filePath ? (
                    <img
                      src={`/api/thumbnails/${thumbnail.id}/image`}
                      alt="Thumbnail"
                      className="w-full aspect-video object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-gray-800 flex items-center justify-center text-gray-500">
                      Not rendered
                    </div>
                  )}
                  {state.loadingEdit === thumbnail.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Loader2Icon className="size-6 animate-spin text-white" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2 rounded-md bg-black/60 p-1.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100">
                    <PencilIcon className="size-4" />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(thumbnail.id);
                    }}
                    disabled={state.deleting === thumbnail.id}
                    className="absolute top-2 right-2 rounded-md bg-black/60 p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-red-600 hover:text-white group-hover:opacity-100 disabled:opacity-50"
                  >
                    {state.deleting === thumbnail.id ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <Trash2Icon className="size-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      <CaptureCameraModal
        open={state.cameraOpen}
        onOpenChange={(open) =>
          dispatch({ type: open ? "open-camera" : "close-camera" })
        }
        onCapture={(dataUrl) => dispatch({ type: "photo-captured", dataUrl })}
      />
    </div>
  );
}
