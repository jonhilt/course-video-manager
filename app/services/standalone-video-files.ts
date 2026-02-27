import path from "node:path";

/**
 * Gets the base directory for storing standalone video files from environment variable.
 * Defaults to "./standalone-video-files" if not configured.
 */
export function getStandaloneVideoFilesBaseDir(): string {
  return process.env.STANDALONE_VIDEO_FILES_DIR || "./standalone-video-files";
}

/**
 * Returns true if the given string is a URL (http:// or https://).
 */
export function isUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

/**
 * Constructs the full path to a file for a standalone video.
 * Files are organized as: {BASE_DIR}/{videoId}/{filename}
 *
 * If the filename is a URL (http/https), it is returned as-is
 * rather than being joined with the local filesystem path.
 *
 * @param videoId - The ID of the video
 * @param filename - The name of the file (optional, returns directory if omitted)
 * @returns The full path to the file or directory, or the URL if filename is a URL
 */
export function getStandaloneVideoFilePath(
  videoId: string,
  filename?: string
): string {
  const baseDir = getStandaloneVideoFilesBaseDir();
  const videoDir = path.join(baseDir, videoId);

  if (filename) {
    if (isUrl(filename)) {
      return filename;
    }
    return path.join(videoDir, filename);
  }

  return videoDir;
}
