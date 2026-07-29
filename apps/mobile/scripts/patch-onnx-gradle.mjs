// Patches onnxruntime-react-native's android/build.gradle for Gradle 9.
//
// The package guards a legacy fbjni dependency with:
//
//   if (VersionNumber.parse(REACT_NATIVE_VERSION) < VersionNumber.parse("0.71")) { … }
//
// `VersionNumber` is org.gradle.util.VersionNumber — an internal Gradle API
// removed in Gradle 9, which Expo SDK 57 / RN 0.86 build with. The result is
// a hard build failure:
//
//   Could not get unknown property 'VersionNumber' for object of type
//   org.gradle.api.internal.artifacts.dsl.dependencies.DefaultDependencyHandler
//
// Since this project is on RN 0.86, the guarded branch is dead code — we
// replace the version comparison with `false` rather than deleting the block,
// keeping the diff minimal and obvious.
//
// Idempotent: safe to run repeatedly. Invoked by `eas-build-post-install`
// (so cloud builds self-heal) and available manually for local Gradle builds.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

let gradlePath;
try {
  // Resolves through symlinks in any pnpm/npm layout.
  gradlePath = join(
    dirname(require.resolve("onnxruntime-react-native/package.json")),
    "android",
    "build.gradle",
  );
} catch {
  console.log("[patch-onnx-gradle] onnxruntime-react-native not installed — skipping");
  process.exit(0);
}

const NEEDLE = 'VersionNumber.parse(REACT_NATIVE_VERSION) < VersionNumber.parse("0.71")';
const REPLACEMENT = 'false /* patched: Gradle 9 removed org.gradle.util.VersionNumber; RN 0.86 > 0.71 */';

const source = readFileSync(gradlePath, "utf8");

if (!source.includes(NEEDLE)) {
  const already = source.includes("patched: Gradle 9 removed");
  console.log(
    already
      ? "[patch-onnx-gradle] already patched"
      : "[patch-onnx-gradle] guard not found — upstream may have fixed it; nothing to do",
  );
  process.exit(0);
}

writeFileSync(gradlePath, source.replace(NEEDLE, REPLACEMENT));
console.log(`[patch-onnx-gradle] patched ${gradlePath}`);
