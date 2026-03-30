/**
 * Generates FCPXML (version 1.11) for importing timelines into
 * DaVinci Resolve, Final Cut Pro, or Premiere Pro.
 *
 * All times are expressed as rational frame counts (e.g. "3000/30s")
 * so the result is frame-accurate regardless of FPS.
 */

interface FcpxmlClip {
  inputVideo: string;
  startTime: number;
  duration: number;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convert a time in seconds to an FCPXML rational time string.
 * Uses integer frame counts to avoid floating-point drift.
 */
function rationalTime(seconds: number, fps: number): string {
  const frames = Math.round(seconds * fps);
  return `${frames}/${fps}s`;
}

export function generateFcpxml(opts: {
  timelineName: string;
  clips: FcpxmlClip[];
  fps: number;
}): string {
  const { timelineName, clips, fps } = opts;

  // Build unique asset list
  const uniqueVideos = [...new Set(clips.map((c) => c.inputVideo))];
  const assetIds = new Map(uniqueVideos.map((v, i) => [v, `asset-${i + 1}`]));

  // Calculate total timeline duration
  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

  const assets = uniqueVideos
    .map((video, i) => {
      const id = `asset-${i + 1}`;
      return `        <asset id="${id}" name="${escapeXml(video)}" src="file://${escapeXml(video)}" hasVideo="1" hasAudio="1" />`;
    })
    .join("\n");

  // Build asset-clips on the spine, placed sequentially
  let offset = 0;
  const assetClips = clips
    .map((clip) => {
      const assetId = assetIds.get(clip.inputVideo)!;
      const clipXml = `            <asset-clip ref="${assetId}" offset="${rationalTime(offset, fps)}" name="${escapeXml(timelineName)}" start="${rationalTime(clip.startTime, fps)}" duration="${rationalTime(clip.duration, fps)}" />`;
      offset += clip.duration;
      return clipXml;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.11">
    <resources>
${assets}
    </resources>
    <library>
        <event name="${escapeXml(timelineName)}">
            <project name="${escapeXml(timelineName)}">
                <sequence format="r1" tcStart="0s" tcFormat="NDF" duration="${rationalTime(totalDuration, fps)}">
                    <spine>
${assetClips}
                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>`;
}
