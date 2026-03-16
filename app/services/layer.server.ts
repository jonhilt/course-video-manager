import { Layer, ManagedRuntime } from "effect";
import { DBFunctionsService } from "./db-service.server";
import { DrizzleService } from "./drizzle-service.server";
import { DatabaseDumpService } from "./dump-service";
import { CourseRepoParserService } from "./course-repo-parser";
import { NodeContext } from "@effect/platform-node";
import { VideoProcessingService } from "./video-processing-service";
import { BackgroundRemovalService } from "./background-removal-service";
import { VideoEditorLoggerService } from "./video-editor-logger-service";
import { FeatureFlagService } from "./feature-flag-service";
import { OpenFolderService } from "./open-folder-service";
import { CloudinaryService } from "./cloudinary-service";
import { CloudinaryMarkdownService } from "./cloudinary-markdown-service";
import { CourseRepoWriteService } from "./course-repo-write-service";
import { CourseWriteService } from "./course-write-service";
import { CourseRepoSyncValidationService } from "./course-repo-sync-validation";
import { FFmpegCommandsService } from "./ffmpeg-commands";

const CloudinaryMarkdownLayer = CloudinaryMarkdownService.Default.pipe(
  Layer.provide(CloudinaryService.Default)
);

export const layerLive = Layer.mergeAll(
  CourseRepoParserService.Default,
  DatabaseDumpService.Default,
  VideoProcessingService.Default,
  DBFunctionsService.Default,
  BackgroundRemovalService.Default,
  VideoEditorLoggerService.Default,
  FeatureFlagService.Default,
  OpenFolderService.Default,
  CloudinaryService.Default,
  CloudinaryMarkdownLayer,
  CourseRepoWriteService.Default,
  CourseWriteService.Default,
  CourseRepoSyncValidationService.Default,
  FFmpegCommandsService.Default,
  NodeContext.layer
).pipe(Layer.provideMerge(DrizzleService.Default));

export const runtimeLive = ManagedRuntime.make(layerLive);
