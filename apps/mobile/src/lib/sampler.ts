import * as VideoThumbnails from "expo-video-thumbnails";
import { createVideoPlayer } from "expo-video";

/** Read the video's duration without rendering a player view. */
export async function probeDurationS(uri: string): Promise<number> {
  const player = createVideoPlayer({ uri });
  try {
    return await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out reading video metadata")),
        15000,
      );
      const subscription = player.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay") {
          clearTimeout(timeout);
          subscription.remove();
          resolve(player.duration);
        } else if (status === "error") {
          clearTimeout(timeout);
          subscription.remove();
          reject(new Error("Could not read this video"));
        }
      });
    });
  } finally {
    player.release();
  }
}

export interface SampledFrame {
  timestampS: number;
  /** File URI of the extracted frame image (JPEG). */
  uri: string;
}

/**
 * Extract a frame at a timestamp via the platform thumbnailer — the mobile
 * analogue of the web app's seek-and-draw loop.
 */
export async function extractFrame(
  videoUri: string,
  timestampS: number,
): Promise<SampledFrame> {
  const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
    time: Math.round(timestampS * 1000),
    quality: 0.7,
  });
  return { timestampS, uri };
}
