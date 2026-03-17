import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFocusRevalidate } from "@/hooks/use-focus-revalidate";
import { generateChangelog } from "@/services/changelog-service";
import { CoursePublishService } from "@/services/course-publish-service";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { Console, Effect } from "effect";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { data, Link, useNavigate, useRevalidator } from "react-router";
import type { Route } from "./+types/courses.$courseId.publish";

export const loader = async (args: Route.LoaderArgs) => {
  const { courseId } = args.params;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const publishService = yield* CoursePublishService;

    const course = yield* db.getCourseById(courseId);
    const latestVersion = yield* db.getLatestCourseVersion(courseId);

    if (!latestVersion) {
      return yield* Effect.die(data("No version found", { status: 404 }));
    }

    // Get changelog preview (treat draft as if it were published with a placeholder name)
    const allVersions = yield* db.getAllVersionsWithStructure(courseId);
    const changelogVersions = allVersions.map((v) =>
      v.id === latestVersion.id
        ? { ...v, name: "(Draft — pending publish)" }
        : v
    );
    const changelog = generateChangelog(changelogVersions);

    // Get previous published version name (allVersions is sorted newest first)
    const previousVersion = allVersions.length > 1 ? allVersions[1] : null;

    // Get unexported videos
    const { unexportedVideoIds } = yield* publishService.validatePublishability(
      latestVersion.id
    );

    return {
      course,
      latestVersion,
      previousVersionName: previousVersion?.name ?? null,
      changelog,
      unexportedVideoCount: unexportedVideoIds.length,
    };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Course not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

type PublishStage =
  | "idle"
  | "validating"
  | "uploading"
  | "freezing"
  | "cloning"
  | "complete"
  | "error";

const STAGE_LABELS: Record<PublishStage, string> = {
  idle: "",
  validating: "Validating...",
  uploading: "Uploading to Dropbox...",
  freezing: "Freezing version...",
  cloning: "Creating new draft...",
  complete: "Published!",
  error: "Publish failed",
};

export default function Component(props: Route.ComponentProps) {
  const {
    course,
    latestVersion,
    previousVersionName,
    changelog,
    unexportedVideoCount,
  } = props.loaderData;
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [publishStage, setPublishStage] = useState<PublishStage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useFocusRevalidate({ enabled: publishStage === "idle" && !isExporting });

  const hasUnexportedVideos = unexportedVideoCount > 0;
  const canPublish =
    name.trim().length > 0 && !hasUnexportedVideos && publishStage === "idle";

  const handleExportAll = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      const response = await fetch(
        `/api/courseVersions/${latestVersion.id}/batch-export-sse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok || !response.body) {
        throw new Error("Failed to start batch export");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ") && eventType) {
            const eventData = JSON.parse(line.slice(6));
            if (eventType === "error") {
              throw new Error(eventData.message);
            }
            eventType = "";
          }
        }
      }

      revalidator.revalidate();
    } catch (e) {
      console.error("Batch export failed:", e);
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [latestVersion.id, revalidator]);

  const handlePublish = useCallback(async () => {
    setPublishStage("validating");
    setErrorMessage(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`/api/courses/${course.id}/publish-sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        setPublishStage("error");
        setErrorMessage("Failed to start publish");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ") && eventType) {
            const eventData = JSON.parse(line.slice(6));

            if (eventType === "progress") {
              setPublishStage(eventData.stage);
            } else if (eventType === "complete") {
              setPublishStage("complete");
              // Navigate to the new draft after a brief delay
              setTimeout(() => {
                navigate(
                  `/?courseId=${course.id}&versionId=${eventData.newDraftVersionId}`
                );
              }, 1500);
            } else if (eventType === "error") {
              setPublishStage("error");
              setErrorMessage(eventData.message);
            }
            eventType = "";
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setPublishStage("error");
      setErrorMessage(e instanceof Error ? e.message : "Publish failed");
    }
  }, [course.id, name, description, navigate]);

  const isPublishing =
    publishStage !== "idle" &&
    publishStage !== "error" &&
    publishStage !== "complete";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <Link
            to={`/?courseId=${course.id}`}
            onClick={(e) => e.preventDefault()}
            onMouseDown={(e) => {
              if (e.button === 0) navigate(`/?courseId=${course.id}`);
            }}
          >
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to {course.name}
            </Button>
          </Link>
        </div>

        <h1 className="text-2xl font-bold mb-2">Publish {course.name}</h1>
        {previousVersionName && (
          <p className="text-sm text-muted-foreground mb-6">
            {previousVersionName} <ChevronRight className="inline w-3 h-3" />{" "}
            {name.trim() || <span className="italic">New Version</span>}
          </p>
        )}

        {/* Publish Form */}
        <div className="space-y-4 mb-8">
          <div className="space-y-2">
            <Label htmlFor="version-name">Version Name *</Label>
            <Input
              id="version-name"
              placeholder='e.g. "v2.1 — Added auth module"'
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPublishing || publishStage === "complete"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="version-description">Description</Label>
            <Textarea
              id="version-description"
              placeholder="Optional description of what changed..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPublishing || publishStage === "complete"}
              rows={3}
            />
          </div>
        </div>

        {/* Unexported Videos */}
        {hasUnexportedVideos && (
          <div className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <span className="text-sm font-medium text-amber-500">
                  {unexportedVideoCount} unexported video
                  {unexportedVideoCount !== 1 ? "s" : ""}
                </span>
              </div>
              <Button
                size="sm"
                onClick={handleExportAll}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-3 h-3 mr-1" />
                    Export All
                  </>
                )}
              </Button>
            </div>
            {exportError && (
              <p className="text-sm text-destructive mt-2">{exportError}</p>
            )}
          </div>
        )}

        {/* Publish Button */}
        <div className="mb-8">
          {publishStage === "error" && errorMessage && (
            <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          {publishStage === "complete" && (
            <div className="mb-3 rounded-md border border-green-500/50 bg-green-500/5 p-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Published successfully! Redirecting to new draft...
            </div>
          )}

          <Button
            onClick={handlePublish}
            disabled={!canPublish}
            className="w-full"
            size="lg"
          >
            {isPublishing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {STAGE_LABELS[publishStage]}
              </>
            ) : publishStage === "error" ? (
              "Retry Publish"
            ) : (
              "Publish"
            )}
          </Button>

          {publishStage === "error" && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={() => {
                setPublishStage("idle");
                setErrorMessage(null);
              }}
            >
              Reset
            </Button>
          )}
        </div>

        {/* Changelog Preview */}
        <div className="border-t border-border pt-6">
          <h2 className="text-lg font-semibold mb-4">Changelog Preview</h2>
          <div className="prose dark:prose-invert max-w-none">
            <Markdown rehypePlugins={[rehypeRaw]}>{changelog}</Markdown>
          </div>
        </div>
      </div>
    </div>
  );
}
