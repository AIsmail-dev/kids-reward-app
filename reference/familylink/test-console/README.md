# Family Link Test Console

A local web app for trying the unofficial `g-family-link` library against your own Family Link account.
It runs only on this computer (127.0.0.1) and talks to Google directly from here.

## Start

    cd ~/Projects/familylink-app
    npm install        # first time only
    npm start

Then open http://127.0.0.1:4750 in your browser. Stop with Ctrl+C.

To try the interface with made-up data and no Google calls: `npm run demo`.

## Connect your account

1. In Chrome, open familylink.google.com signed in as the parent.
2. Cookie-Editor extension > Export > JSON.
3. Paste into the box on the app's first screen and press Save.

The cookies are saved to `cookies.json` in this folder (readable only by you). "Delete cookies" in the app removes the file.

## What you can test

| Area | Read | Write (needs write mode) |
|------|------|--------------------------|
| Devices | name, model, lock state | lock, unlock |
| Limits | used, remaining, daily limit, bonus | set daily limit, turn limit on/off, add or cancel bonus |
| Screen time | today per app, daily history | |
| Schedules | bedtime and school time | turn on/off, set bedtime for a day |

## Safety

- Write mode is off every time the app starts. While it is off, the server refuses to send anything but read requests.
- Every write asks for confirmation and is recorded in the activity log.
- The server accepts requests only from this computer's browser.
- Location is not included, because polling it can notify the child's device.

## Options

    PORT=5000 npm start        # different port
    AUTH_USER=1 npm start      # if Family Link is on the 2nd Google account signed in to Chrome

This uses unofficial endpoints. Google can change them at any time, and automating them may be against Google's Terms of Service.
