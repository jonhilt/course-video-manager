import { Console, Effect } from "effect";
import type { Route } from "./+types/api.videos.$videoId.reveal";
import { runtimeLive } from "@/services/layer";
import { data } from "react-router";
import { getVideoPath } from "@/lib/get-video";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Converts a WSL path to a Windows path using wslpath
 */
const wslPathToWindows = (wslPath: string): Effect.Effect<string, Error> => {
  return Effect.tryPromise({
    try: async () => {
      const { stdout } = await execAsync(`wslpath -w "${wslPath}"`);
      return stdout.trim();
    },
    catch: (e) => new Error(`Failed to convert path: ${e}`),
  });
};

/**
 * Opens Windows Explorer with the file selected
 */
const revealInExplorer = (windowsPath: string): Effect.Effect<void, Error> => {
  return Effect.tryPromise({
    try: async () => {
      // Use powershell.exe to run explorer.exe with /select flag
      const command = `powershell.exe -c "explorer.exe '/select,\\"${windowsPath}\\"'"`;
      await execAsync(command);
    },
    catch: (e) => new Error(`Failed to reveal file: ${e}`),
  });
};

export const action = async (args: Route.ActionArgs) => {
  const videoId = args.params.videoId;

  return Effect.gen(function* () {
    const videoPath = getVideoPath(videoId);

    // Convert WSL path to Windows path
    const windowsPath = yield* wslPathToWindows(videoPath);

    // Reveal in Windows Explorer
    yield* revealInExplorer(windowsPath);

    return { success: true };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll((e) => {
      Console.error(`Error revealing video: ${e}`);
      return Effect.die(data("Failed to reveal file", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
