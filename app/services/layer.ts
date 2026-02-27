import { Layer, ManagedRuntime } from "effect";
import { DBFunctionsService } from "./db-service";
import { DrizzleService } from "./drizzle-service";
import { DatabaseDumpService } from "./dump-service";
import { RepoParserService } from "./repo-parser";
import { NodeContext } from "@effect/platform-node";
import { VideoProcessingService } from "./video-processing-service";
import { BackgroundRemovalService } from "./background-removal-service";
import { VideoEditorLoggerService } from "./video-editor-logger-service";
import { FeatureFlagService } from "./feature-flag-service";
import { OpenFolderService } from "./open-folder-service";
import { CloudinaryService } from "./cloudinary-service";
import { CloudinaryMarkdownService } from "./cloudinary-markdown-service";

const CloudinaryMarkdownLayer = CloudinaryMarkdownService.Default.pipe(
  Layer.provide(CloudinaryService.Default)
);

export const layerLive = Layer.mergeAll(
  RepoParserService.Default,
  DatabaseDumpService.Default,
  VideoProcessingService.Default,
  DBFunctionsService.Default,
  BackgroundRemovalService.Default,
  VideoEditorLoggerService.Default,
  FeatureFlagService.Default,
  OpenFolderService.Default,
  CloudinaryService.Default,
  CloudinaryMarkdownLayer,
  NodeContext.layer
).pipe(Layer.provideMerge(DrizzleService.Default));

export const runtimeLive = ManagedRuntime.make(layerLive);
