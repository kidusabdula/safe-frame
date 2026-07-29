import * as ImageManipulator from "expo-image-manipulator";
import { toByteArray } from "base64-js";
import { decode as decodeJpeg } from "jpeg-js";
import { MODEL_INPUT_SIZE } from "@safeframe/core";

/**
 * Frame image URI → normalized Float32Array in CHW layout, ready for the
 * ViT ONNX session. Resize happens natively (expo-image-manipulator);
 * jpeg-js decodes to RGBA; normalization matches the model's preprocessor
 * (mean 0.5, std 0.5 per channel → x in [-1, 1]).
 */
export async function frameToTensor(uri: string): Promise<Float32Array> {
  const size = MODEL_INPUT_SIZE;
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: size, height: size } }],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!manipulated.base64) {
    throw new Error("Image manipulation returned no data");
  }

  const jpegBytes = toByteArray(manipulated.base64);
  const { data, width, height } = decodeJpeg(jpegBytes, { useTArray: true });
  if (width !== size || height !== size) {
    throw new Error(`Unexpected decoded frame size ${width}×${height}`);
  }

  // RGBA interleaved → CHW planar, normalized to [-1, 1].
  const plane = size * size;
  const tensor = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    tensor[i] = (r / 255 - 0.5) / 0.5;
    tensor[plane + i] = (g / 255 - 0.5) / 0.5;
    tensor[2 * plane + i] = (b / 255 - 0.5) / 0.5;
  }
  return tensor;
}
