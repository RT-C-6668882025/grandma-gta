#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -n "${ANDROID_SIGNING_FILE:-}" && test -f "$ANDROID_SIGNING_FILE" || {
  echo 'Fixed signing configuration required: set ANDROID_SIGNING_FILE. Refusing to generate a replacement key.' >&2
  exit 1
}
task_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
test -n "$task_sdk" || { echo 'Android SDK is required'; exit 1; }
task_tools="$task_sdk/build-tools/35.0.0"
task_jar="$task_sdk/platforms/android-35/android.jar"
test -f "$task_jar"
mkdir -p android/build/classes android/build/dex android/build/assets/web
cp -r index.html LICENSE src assets vendor android/build/assets/web/
# Android WebView serves local originals; skip network transfer packing and duplicate gzip copies.
rm -rf android/build/assets/web/assets/packed
printf 'export const MODEL_ASSETS = {};\n' > android/build/assets/web/src/model-manifest.js
javac -source 8 -target 8 -encoding UTF-8 -bootclasspath "$task_jar" -d android/build/classes android/src/com/rt/grandmagta/MainActivity.java
jar cf android/build/classes.jar -C android/build/classes .
"$task_tools/d8" --lib "$task_jar" --min-api 26 --output android/build/dex android/build/classes.jar
"$task_tools/aapt2" link -o android/build/unsigned.apk -I "$task_jar" --manifest android/AndroidManifest.xml -A android/build/assets
(cd android/build/dex && zip -q -u ../unsigned.apk classes.dex)
"$task_tools/zipalign" -f 4 android/build/unsigned.apk android/build/aligned.apk
python3 android/sign-apk.py "$ANDROID_SIGNING_FILE" "$task_tools" android/build/aligned.apk android/build/grandma-gta-phone-tablet.apk
"$task_tools/zipalign" -c -P 16 4 android/build/grandma-gta-phone-tablet.apk
"$task_tools/aapt2" dump badging android/build/grandma-gta-phone-tablet.apk >/dev/null
printf 'Built android/build/grandma-gta-phone-tablet.apk with fixed signing identity\n'
