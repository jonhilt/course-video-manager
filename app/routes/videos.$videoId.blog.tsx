import { BlogPage } from "@/features/video-posting/blog-page";
import type { Route } from "./+types/videos.$videoId.blog";

export const loader = async (args: Route.LoaderArgs) => {
  const { videoId } = args.params;
  return { videoId };
};

export default function BlogRoute(props: Route.ComponentProps) {
  const { videoId } = props.loaderData;
  return <BlogPage videoId={videoId} />;
}
