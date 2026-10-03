import { config as loadEnv } from "dotenv";
import { config, higgsfield, HiggsfieldError, APIError } from "@higgsfield/client/v2";

// Server-side only: credentials are read from .env.local at runtime and never printed.
loadEnv({ path: ".env.local", quiet: true });

const MODEL = "bytedance/seedance-2.5/text-to-video";

async function main(): Promise<number> {
  const credentials = process.env.HF_CREDENTIALS;
  if (!credentials || !/^[^:\s]+:[^:\s]+$/.test(credentials)) {
    console.error("HF_CREDENTIALS is missing or not in key-id:key-secret format. Set it in .env.local.");
    return 1;
  }

  config({ credentials });

  const result = await higgsfield.subscribe(MODEL, {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  });

  // subscribe resolves (does not throw) for failed/nsfw, so check the status explicitly.
  switch (result.status) {
    case "completed": {
      const url = result.video?.url;
      if (!url) {
        console.error(`Request ${result.request_id} completed but returned no video URL.`);
        return 1;
      }
      console.log(url);
      return 0;
    }
    case "nsfw":
      console.error(`Request ${result.request_id} was rejected by moderation (nsfw). No video generated.`);
      return 1;
    case "failed":
      console.error(`Request ${result.request_id} failed. No video generated.`);
      return 1;
    default:
      // Covers canceled and any other non-completed terminal/unknown status.
      console.error(`Request ${result.request_id} ended with status "${result.status}". No video generated.`);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    if (err instanceof APIError) {
      console.error(`Higgsfield API error${err.statusCode ? ` (${err.statusCode})` : ""}: ${err.message}`);
    } else if (err instanceof HiggsfieldError) {
      console.error(`Higgsfield error (${err.constructor.name}): ${err.message}`);
    } else {
      console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  });
