import { Asset } from "expo-asset";
import { InferenceSession, Tensor } from "onnxruntime-react-native";
import { MODEL_INPUT_SIZE, TIER2_MODEL_ID } from "@safeframe/core";

export interface NsfwSession {
  /** NSFW probability for one preprocessed CHW frame tensor. */
  classify(tensor: Float32Array): Promise<number>;
  loadMs: number;
  modelId: typeof TIER2_MODEL_ID;
}

/**
 * Typed adapter around onnxruntime-react-native — untyped session I/O is
 * confined to this file. The quantized ViT ships as a bundled asset, so
 * inference works with the radio off (airplane-mode demo).
 *
 * Model outputs logits over [sfw, nsfw]; softmax index 1 is the NSFW
 * probability. Verified against the model's own config.json rather than
 * assumed — AdamCodd/vit-base-nsfw-detector declares
 * `id2label: {"0": "sfw", "1": "nsfw"}`.
 */
const NSFW_LOGIT_INDEX = 1;

let sessionPromise: Promise<NsfwSession> | null = null;

export function loadNsfwSession(): Promise<NsfwSession> {
  sessionPromise ??= (async () => {
    const t0 = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asset = Asset.fromModule(require("../../assets/models/vit-nsfw-int8.onnx"));
    await asset.downloadAsync();
    if (!asset.localUri) {
      throw new Error("ONNX model asset has no local URI");
    }
    const session = await InferenceSession.create(asset.localUri);
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    if (!inputName || !outputName) {
      throw new Error("ONNX session exposes no input/output");
    }

    return {
      loadMs: Date.now() - t0,
      modelId: TIER2_MODEL_ID,
      async classify(tensor: Float32Array): Promise<number> {
        const input = new Tensor("float32", tensor, [
          1,
          3,
          MODEL_INPUT_SIZE,
          MODEL_INPUT_SIZE,
        ]);
        const output = await session.run({ [inputName]: input });
        const logits = output[outputName]?.data;
        if (!logits || logits.length < 2) {
          throw new Error("Unexpected ONNX output shape");
        }
        const a = Number(logits[0]);
        const b = Number(logits[1]);
        // Numerically stable 2-class softmax.
        const max = Math.max(a, b);
        const ea = Math.exp(a - max);
        const eb = Math.exp(b - max);
        const probs = [ea / (ea + eb), eb / (ea + eb)] as const;
        return probs[NSFW_LOGIT_INDEX];
      },
    };
  })();
  return sessionPromise;
}
