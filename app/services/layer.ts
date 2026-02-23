import { Layer, ManagedRuntime } from "effect";
import { DBFunctionsService } from "./db-service";
import { DrizzleService } from "./drizzle-service";
import { DatabaseDumpService } from "./dump-service";
import { RepoParserService } from "./repo-parser";
import { NodeContext } from "@effect/platform-node";
import { TotalTypeScriptCLIService } from "./tt-cli-service";
import { BackgroundRemovalService } from "./background-removal-service";
import { VideoEditorLoggerService } from "./video-editor-logger-service";

export const layerLive = Layer.mergeAll(
  RepoParserService.Default,
  DatabaseDumpService.Default,
  TotalTypeScriptCLIService.Default,
  DBFunctionsService.Default,
  BackgroundRemovalService.Default,
  VideoEditorLoggerService.Default,
  NodeContext.layer
).pipe(Layer.provideMerge(DrizzleService.Default));

export const runtimeLive = ManagedRuntime.make(layerLive);
