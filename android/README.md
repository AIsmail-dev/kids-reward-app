# Kids Rewards (Android)

A Trusted Web Activity: the production site (https://ahmeds-macbook-pro.tail712747.ts.net, served by
the Docker stack on the home Mac) shown full screen in Chrome, with no address bar. Web push from the
site arrives as this app's notifications. Screens and features come from the server, so the app only
needs rebuilding if the address, icon or name changes.

- Build: `./build.sh` → `public/kids-rewards.apk`; run `../deploy.sh` to publish it.
- Install: open https://ahmeds-macbook-pro.tail712747.ts.net/kids-rewards.apk (or http://kids.lan/kids-rewards.apk)
  on the phone and allow installing unknown apps when asked. Needs Android 7+ and Chrome.
- Full screen depends on `public/.well-known/assetlinks.json` listing this signing key's SHA-256
  fingerprint. If it doesn't match (or Chrome can't reach the site), the app still works but shows a URL bar.
- Signing key: `keystore/release.jks` + `keystore/keystore.properties` (gitignored). Back them up — Android
  only installs an update over the app if it's signed with the same key, and assetlinks.json names this key.
- Bump `versionCode` in `app/build.gradle.kts` when rebuilding, or Android won't offer it as an update.
