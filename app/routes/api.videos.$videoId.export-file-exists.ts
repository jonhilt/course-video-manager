import { existsSync } from "node:fs";
import { getVideoPath } from "@/lib/get-video";
import type { Route } from "./+types/api.videos.$videoId.export-file-exists";

export const loader = async (args: Route.LoaderArgs) => {
  const { videoId } = args.params;
  const exportPath = getVideoPath(videoId);
  const exists = existsSync(exportPath);

  return Response.json({ exists });
};
