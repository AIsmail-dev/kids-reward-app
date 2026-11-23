#!/bin/sh
# Builds the signed APK and puts it where the production site offers it for download
# (https://ahmeds-macbook-pro.tail712747.ts.net/kids-rewards.apk and http://kids.lan/kids-rewards.apk
# after ../deploy.sh).
set -e
cd "$(dirname "$0")"
export JAVA_HOME="$HOME/development/jdk-21.0.12.1+1/Contents/Home" ANDROID_HOME="$HOME/development/android-sdk"
./gradlew assembleRelease -q
cp app/build/outputs/apk/release/app-release.apk ../public/kids-rewards.apk
echo "Built public/kids-rewards.apk — run ../deploy.sh to publish it"
