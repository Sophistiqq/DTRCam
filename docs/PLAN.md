# DTRCam — Planning Document

Employee attendance camera app replacing the "Timestamp Camera → Viber → manual encoding" workflow.

- **Status:** Planning
- **Date:** 2026-08-23
- **Owner:** Roi

---

## 1. Problem Statement

Field employees currently prove attendance by taking timestamped selfies with a third-party app and sending them to Reception via Viber. Reception then manually encodes each photo's details into an offline Visual FoxPro (VFP) payroll system.

With hundreds of employees punching **twice daily (Time In / Time Out)**, this stacks up: manual transcription is slow, error-prone, unverifiable, and photos arrive late or not at all when signal is bad.

## 2. Solution Summary

A dead-simple installable PWA:

> **Open app → tap TIME IN or TIME OUT → selfie captured with burned-in date/time/name/GPS → done.**

If there is no internet, the punch is queued on-device and auto-syncs later. If GPS is also unavailable, the employee types their location as free text. Reception/payroll never touches the data manually — the VFP developer pulls clean, normalized attendance rows from a read-only REST API.

### Known limitations (accepted)

| Limitation | Handling |
|---|---|
| No GPS *and* no internet at remote sites | Manual free-text location; time still comes from trusted device clock |
| Device clock can be wrong/tampered while offline | Trusted-time mechanism (§7) neutralizes raw clock drift; residual gap accepted |
| Web platform can't fully prevent GPS spoofing | Anomaly flags (impossible travel, accuracy, mock patterns) surfaced via API; hard prevention out of scope |

## 3. Goals & Non-Goals

**Goals**
1. Punch flow completable in ≤ 3 taps from cold open.
2. Works fully offline: capture, queue, retry-on-connect.
3. Tamper-resistant timestamps, locations, and photos.
4. Zero manual encoding — machine-readable API for the VFP payroll developer.
5. Admin panel for account management only (no attendance dashboards).
6. Runs on Android and iPhone as a PWA.

**Non-Goals**
- Face recognition / liveness detection (v2 candidate).
- Geofencing enforcement ("allowed areas").
- Payroll computation itself — that stays in VFP.
- Push notifications / absence alerts (v2).
- Native app store distribution.

## 4. Users & Roles

| Role | Access | Notes |
|---|---|---|
| `employee` | Punch screen only (In/Out), own last-7-days history | The entire employee UX |
| `admin` | Admin panel: create/deactivate employees, reset passwords, manage API keys, view quarantined punches | HR/you; not reception-facing |
| `machine` (VFP consumer) | Read-only REST API v1 via API key | Used by the VFP developer |

No self-registration. Accounts are created by an admin through the panel form (employee no., full name, username, temp password).

Login = username + password backed by **Supabase Auth** (usernames mapped to internal email aliases, e.g. `0458@dtrcam.internal`, so employees never see an email field). Session persists locally so a one-time login survives offline use.

## 5. Core Flows

### 5.1 Punch (online)
1. Open app → home shows two large buttons: **TIME IN** / **TIME OUT** (state-aware: today's punches shown small underneath).
2. Tap button → front camera opens full-screen → shutter.
3. App captures GPS fix (with accuracy) in parallel during camera preview.
4. On shutter: overlay is burned into the bitmap (date, time, employee name + no., "IN"/"OUT", GPS coords/address), EXIF metadata embedded, SHA-256 computed.
5. Upload immediately → server validates → done. Green check, return to home.

### 5.2 Punch (offline)
1. Steps 1–4 identical. GPS works without internet; if no fix within ~10s timeout:
   - Prompt: **"No GPS — type your location"** → free text required to proceed.
   - Record marked `location_source: manual`.
2. Punch stored in IndexedDB queue with all evidence (image bytes, hashes, times, coords/text).
3. Background attempts: on reconnect events, app focus, periodic timer while open.
4. On success: queue item removed, local history updated.

### 5.3 Strict validation (on sync)
Per your decision, validation is strict. Because offline duration is legitimate, "strict" targets **clock integrity**, enforced two ways:

- **Trusted clock:** every time the app is online it fetches server time and stores `{server_time, monotonic_start}`. While offline, display/capture time = `server_time + monotonic_elapsed` — *not* the raw device clock. A drifted or manually-set device clock therefore cannot forge times.
- **Server-side checks at ingest:**
  - `captured_at` more than tolerance ahead of server now → **reject → quarantine**.
  - Capture-to-upload gap beyond configurable window (default 12h) → accept but flag `late_sync`.
  - Payload hash mismatch (photo altered between capture and upload) → **reject → quarantine**.
  - Duplicate `(employee, work_date, punch_type)` → rejected → quarantine as duplicate backup (no retake grace window; the primary record stays untouched).
  - Missing both GPS and manual location → reject client-side before queuing.

Quarantined punches are visible in the admin panel; admins can discard or force-accept with a note.

## 6. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Bun 1.4** | Server runtime, package manager, test runner |
| Framework | **SvelteKit** (`adapter-node`) | Served by Bun behind Docker on Render |
| Image processing | **Bun.Image** | Server-side: recompress to target size, generate thumbnail, verify/re-stamp metadata on ingest |
| Client image work | Canvas API | Burn-in overlay + EXIF write happen on-device at capture (must survive offline) |
| DB / Auth / Storage | **Supabase** | Postgres + RLS, Auth (username-mapped emails), Storage bucket for media |
| Offline store | IndexedDB + Service Worker | Custom queue (Background Sync API unsupported on iOS) |
| Scheduler | **Bun Cron** | Nightly rollups, housekeeping (§9) |
| Hosting | **Render** | Dockerfile + `render.yaml`; single web service + cron worker |
| Payroll integration | REST API v1, `X-API-Key` auth | Read-only, shaped for VFP import |

## 7. Anti-Tamper Design

1. **Burned-in overlay** — timestamp/location rendered into pixels at capture; cropping can't remove it.
2. **EXIF embedding** — coords, capture time, device info written into the file.
3. **Content hash** — SHA-256 of image bytes at capture; server re-hashes uploaded bytes and compares (detects post-capture edits).
4. **Hash chain** — each punch stores `hash(prev_hash || payload_hash || captured_at || ...)` per employee → any deletion/backdating breaks the chain, detectable by audit endpoint.
5. **Dual timestamps** — `captured_at` (trusted clock) and `received_at` (server) stored side by side; gaps reported.
6. **Location evidence** — coords + accuracy stored raw; reverse-geocoded address enriched server-side at ingest (needs internet, so done once, not on-device).
7. **Anomaly flags** — impossible travel between consecutive punches, accuracy > threshold, repeated identical coordinates, manual-location overuse streaks.

All flags are advisory data on the record; rejection rules are limited to §5.3 to avoid punishing honest field workers.

## 8. Data Model (Supabase Postgres)

```
profiles            id (auth uid), employee_no, full_name, role, is_active,
                    created_by, created_at
punches             id, employee_id, work_date, punch_type (in|out),
                    captured_at, received_at, trusted_clock_epoch,
                    lat, lng, gps_accuracy_m, location_source (gps|manual),
                    location_text, address_enriched,
                    photo_path, thumb_path, payload_sha256, prev_hash, row_hash,
                    status (accepted|late_sync|quarantined),
                    anomaly_flags jsonb, quarantine_reason, synced_device_id
devices             id, employee_id, model, os, last_seen_at, clock_offset_ms
api_keys            id, label, key_hash, is_active, last_used_at, created_at
audit_log           id, actor, action, entity, entity_id, detail jsonb, at
daily_summary       employee_id, work_date, first_in_at, last_out_at,
                    location_in, location_out, status (complete|missing_out|absent),
                    built_at          ← maintained by Bun Cron
```

Storage buckets: `punch-media/{employee_id}/{yyyy-mm}/{punch_id}.jpg` (original), `-thumb.jpg` (derived). Private bucket; access via short-lived signed URLs only. RLS: employees read own rows; service-role for ingest/API.

## 9. Scheduled Jobs (Bun Cron)

| Schedule | Job |
|---|---|
| 02:00 daily | Rebuild `daily_summary` for yesterday; mark absentees/missing-outs |
| Every 15 min | Retry failed transcodes/thumbnails; expire stale signed URLs |
| Daily 03:00 | Housekeeping: prune old devices/sessions, storage stats report |
| Weekly | Integrity sweep: verify hash chains, email/report anomalies to admin |

## 10. Payroll API (for the VFP developer)

Base: `https://<app>.onrender.com/api/v1` — auth via `X-API-Key` header (hashed at rest, rotatable in admin panel).

| Endpoint | Purpose |
|---|---|
| `GET /punches?from=&to=&employee_no=` | Normalized punch rows incl. evidence URLs (signed, TTL'd) |
| `GET /attendance?from=&to=` | One row per employee/day from `daily_summary`: time-in/out, locations, flags |
| `GET /employees` | Active roster snapshot |
| `GET /anomalies?from=&to=` | Quarantined/flagged records for review |

Responses are flat, stable-schema JSON (documented contract handed to the VFP dev); pagination via cursor; ETag caching. This replaces all manual encoding — Reception's involvement ends entirely.

## 11. iOS / Android PWA Notes

- **iOS:** no Background Sync → sync on app open/focus/interval; request `navigator.storage.persist()` to fight eviction; getUserMedia works in standalone PWA but permission may re-prompt per launch; test front-camera constraints early.
- **Android:** full support; add install prompt UI (QR code poster for deployment day).
- Camera strategy: live `getUserMedia` preview with in-app shutter (consistent framing for the burn-in overlay); fallback to `<input capture>` if stream fails.
- Target sizes: capture ~1080p square-ish crop, server-recompressed ≤ ~300 KB via Bun.Image.

## 12. Deployment (Render)

- `Dockerfile` — Bun base image, `bun install --frozen-lockfile`, `bun run build`, `bun ./build/index.js`.
- `render.yaml` — one web service (SvelteKit node server) + env wiring: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `API_PEPPER`, tolerances config.
- Cron logic ships inside the same Bun process via Bun Cron (no separate worker needed at this scale).
- Supabase project: single cloud project; migrations tracked in-repo.

## 13. Milestones

| # | Deliverable | Exit criteria |
|---|---|---|
| M1 | Scaffold + Supabase schema + login/session persistence | Login works on device, session survives offline reload |
| M2 | Camera + overlay + GPS/manual-location capture | Photo burns correct stamp; saves locally |
| M3 | Offline queue + sync engine + strict validation | Airplane-mode punch syncs intact; tamper cases quarantined |
| M4 | Payroll API v1 + API keys + handoff doc | VFP dev pulls a day of clean rows |
| M5 | Admin panel (accounts, keys, quarantine review) | HR creates/deactivates staff unaided |
| M6 | Cron jobs + hardening + pilot cohort (~20 users) | 2 weeks of real punches, then fleet rollout |

## 14. Risks

| Risk | Mitigation |
|---|---|
| iOS PWA camera/storage quirks | Prototype camera + persistence in M2 before building further |
| Bun.Image young API | Isolate behind a thin ingest module; fall back to sharp if blocked |
| Strict rules frustrating legit edge cases | All thresholds config-driven; quarantine (not delete) keeps evidence recoverable |
| GPS spoofing on personal phones | Anomaly flags + hash chain make abuse detectable; policy handles the rest |

## 15. Open Items

- Retake grace window default (proposed 10 min) — confirm with payroll policy.
- Max `late_sync` window before auto-quarantine (proposed 24h hard cap).
- Employee-visible history scope (proposed: today + last 7 days).
- Data retention (proposed: media 18 months, rows indefinite).
