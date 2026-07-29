/** Model identities as reported in the payload's `engine` block. */
export const TIER1_MODEL_ID = "mobilenet-v2-nsfw@quant";
export const TIER2_MODEL_ID = "vit-nsfw-int8";

/** Hugging Face model id loaded by Transformers.js for Tier 2 (web). */
export const TIER2_HF_MODEL = "AdamCodd/vit-base-nsfw-detector";

/** NSFWJS class names in model output order. */
export const TIER1_CLASSES = [
  "Drawing",
  "Hentai",
  "Neutral",
  "Porn",
  "Sexy",
] as const;
export type Tier1Class = (typeof TIER1_CLASSES)[number];

/** Model input side (both tiers are 224×224 RGB). */
export const MODEL_INPUT_SIZE = 224;

/** Cache API bucket used by the service worker for model weights. */
export const MODEL_CACHE_NAME = "safeframe-models-v1";
export const SHELL_CACHE_NAME = "safeframe-shell-v1";
