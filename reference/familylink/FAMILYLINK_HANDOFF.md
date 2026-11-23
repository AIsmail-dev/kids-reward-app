# Google Family Link integration: handoff notes

Research and a working prototype from a separate Claude session (2 Oct 2026), placed here for use in kids-reward-app.
Nothing in the app imports this folder yet. `test-console/` is a standalone reference, not part of the Vite build.

## Summary

- Google has **no official public API** for Family Link. Everything below uses the private endpoints of the
  familylink.google.com web app, through the community library **`g-family-link`** (npm, v1.1.0, by ludufre).
- Tested read-only against the owner's real parent account (3 supervised children, one with no device): all read calls passed.
- **Write calls (lock, bonus, limits, bedtime) have only been run against demo data, never against Google.** Verify each one on a device you can watch before relying on it.

## How it works

- Base URL: `https://kidsmanagement-pa.clients6.google.com/kidsmanagement/v1`
- Auth: the parent's Google session cookies (exported from Chrome with Cookie-Editor as JSON) plus an
  `Authorization: SAPISIDHASH <ts>_<sha1(ts + " " + SAPISID + " " + origin)>` header, origin `https://familylink.google.com`.
  The library builds this; you only pass the cookie array.
- No OAuth, no API key of your own, no refresh flow. When the cookies expire or the parent signs out, calls return 401
  and the parent must export cookies again.

```js
import { FamilyLink } from 'g-family-link'
const fl = FamilyLink.fromCookies(cookieArray /* Cookie-Editor JSON */, 0 /* Google account index */)
const kids = await fl.getChildren()            // [{ userId, profile: { displayName, photoUrl } }]
```

## Library calls

| Call | Type | Tested live | Returns / does |
|------|------|-------------|----------------|
| `getChildren()` | read | yes | supervised children |
| `getDevices(childId)` | read | yes | `[{ deviceId, name, model }]`, empty for a child with no device |
| `getDailyScreenTime(childId, date?)` | read | yes | `{ totalSeconds, formatted, appBreakdown: { package: seconds } }` |
| `getScreenTimeByDay(childId)` | read | yes | `{ 'YYYY-MM-DD': DailyScreenTime }`, 10 to 30 days seen |
| `getAppliedTimeLimits(childId)` | read | yes | per device: used, remaining, daily limit, bonus, lock state |
| `getTimeLimitRules(childId)` | read | yes | bedtime and school time schedules, on/off |
| `lockDevice` / `unlockDevice(childId, deviceId)` | write | no | |
| `addTimeBonus(childId, deviceId, minutes)` | write | no | note: a bonus replaces the daily limit for the day, it does not add to it |
| `cancelTimeBonus(childId, overrideId)` | write | no | `overrideId` comes from `getAppliedTimeLimits` |
| `setDailyLimit(childId, deviceId, minutes)` | write | no | |
| `enable/disableDailyLimit(childId)` | write | no | |
| `enable/disableBedtime`, `setBedtime(childId, 'HH:MM', 'HH:MM', day 1-7)` | write | no | |
| `enable/disableSchoolTime(childId)` | write | no | |

The most likely fit for a rewards app: `addTimeBonus` when a child earns screen time, and
`getAppliedTimeLimits` / `getDailyScreenTime` to show what they have left.

## Other libraries tested (same day, same account)

| Library | Result |
|---------|--------|
| noiwid/HAFamilyLink (Python, Home Assistant) | All reads passed. Most complete (apps, location, school mode) and the best reference for endpoint payloads: see its `GOOGLE_FAMILY_LINK_API_ANALYSIS.md`. Tied to Home Assistant. |
| tducret/familylink, radamhu/familylink-client (Python) | Work for children with a device, crash on a child with none. |
| Jim56450/familylink-server | Broken against Google's current response format. |

## Things to decide before integrating

1. **Where the Google cookies live.** This app deploys to Vercel with Supabase. Putting the parent's Google session
   cookies in a Vercel function or a Supabase table means a full Google login for that account sits on a server.
   They must never reach the browser bundle (no `VITE_` variable), never be readable by a child's session, and
   should be encrypted at rest. The alternative is to keep Family Link calls on a machine at home and have the app talk to that.
2. **Requests from cloud IPs.** Calls from Vercel reach Google from datacenter addresses with a browser session's
   cookies. Google may challenge or invalidate the session. Untested.
3. **Cookie expiry.** There is no refresh. The app needs a "reconnect Family Link" state and must degrade gracefully on 401.
4. **Terms of Service.** These are private endpoints. Fine for a family's own use at their own risk; not a base for a product offered to others.
5. **Children without a device** return empty lists, not errors. Handle that case in the UI.
6. **Location** was left out on purpose: polling it can notify the child's device.

## The prototype in `test-console/`

A local web app (plain Node `http` server + one HTML page, only dependency `g-family-link`).

    cd reference/familylink/test-console && npm install && npm start   # http://127.0.0.1:4750
    npm run demo                                                        # made-up data, no Google calls

Worth reusing from `server.mjs`:
- the whitelist of read and write actions with input validation,
- the write-mode switch that blocks every non-GET request to Google while off,
- error mapping for expired cookies,
- the demo client, usable as a mock for development.

It saves cookies to `cookies.json` beside itself; that file is git-ignored there. Do not commit real cookies anywhere in this repo.
