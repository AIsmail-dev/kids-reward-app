#!/bin/sh
# Generates the per-kid prayer clips the Android app plays as notification sounds
# (android/app/src/main/res/raw/<kid>_<prayer>_<now|remind>.mp3), spoken by a Microsoft neural
# Arabic voice through the edge-tts tool (`pip install edge-tts`; set EDGE_TTS if it isn't on PATH).
# The phrases, kids' names included, are sent to Microsoft's speech service.
# <kid> is the kid's users.name lowercased (api/trigger_prayer_reminders.js sends the same slug).
# Add a kid below, run this, then android/build.sh and deploy.sh. A kid without clips gets the
# generic public/<prayer>_<now|remind>.mp3 clip instead.
set -e
EDGE_TTS=${EDGE_TTS:-edge-tts}
VOICE=${VOICE:-ar-SA-HamedNeural}
cd "$(dirname "$0")/../android/app/src/main/res/raw"
# speak <file> <text> — the service occasionally returns no audio, so try a few times.
speak() {
  for attempt in 1 2 3 4 5; do
    if "$EDGE_TTS" --voice "$VOICE" --text "$2" --write-media "$1" 2>/dev/null && [ -s "$1" ]; then return 0; fi
    sleep 3
  done
  echo "Could not generate $1" >&2; return 1
}
for kid in "yahia:يحيى" "farida:فريدة"; do
  for prayer in "fajr:الفجر" "dhuhr:الظهر" "asr:العصر" "maghrib:المغرب" "isha:العشاء"; do
    slug=${kid%%:*}; name=${kid#*:}; key=${prayer%%:*}; label=${prayer#*:}
    speak "${slug}_${key}_now.mp3" "يا $name، حان الآن وقت صلاة $label."
    speak "${slug}_${key}_remind.mp3" "يا $name، لا تنسَ صلاة $label."
  done
done
