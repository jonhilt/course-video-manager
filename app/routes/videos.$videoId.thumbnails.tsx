import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import { Console, Effect } from "effect";
import { data } from "react-router";
import type { Route } from "./+types/videos.$videoId.thumbnails";
import { ImageIcon } from "lucide-react";

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

export default function ThumbnailsPage({ loaderData }: Route.ComponentProps) {
  const { thumbnails } = loaderData;

  if (thumbnails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
        <ImageIcon className="size-16 opacity-50" />
        <div className="text-center">
          <p className="text-lg font-medium">No thumbnails yet</p>
          <p className="text-sm mt-1">Create a thumbnail to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">
        Thumbnails ({thumbnails.length})
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {thumbnails.map((thumbnail) => (
          <div key={thumbnail.id} className="border rounded-lg overflow-hidden">
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
          </div>
        ))}
      </div>
    </div>
  );
}
