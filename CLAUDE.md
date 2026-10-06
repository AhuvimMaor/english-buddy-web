# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

English Buddy: a Next.js 16 / React 19 app where Hebrew speakers practice English over WebRTC voice calls. Each call is recorded per speaker, transcribed by Whisper, and analyzed by GPT-4o into a report (grammar fixes, Hebrew words found, fluency score, tips). It is deployed on Railway (nixpacks, Node 22) and wrapped in a Capacitor shell for iOS and Android.

## Commands

No `lint` script and no ESLint config exist. TypeScript is the only static check (`npx tsc --noEmit`).

```bash
npm run dev                  # next dev
npm run build && npm start   # production build / serve
npm test                     # vitest, excludes *.integration.test.ts
npx vitest run src/lib/recording.test.ts          # one file
npx vitest run -t "name of test"                  # one test by name
npm run test:integration     # needs Firebase emulators, runs analyze.integration.test.ts
npm run test:e2e:real        # emulators + real OpenAI calls (costs money, needs OPENAI_API_KEY)
npm run validate:analyze     # python3 regression check against real recordings (needs OPENAI_API_KEY)
```

Vitest runs in the `node` environment and only picks up `src/**/*.test.ts`, so there is no component or browser test setup. `analyze.e2e.test.ts` runs under `npm test`. The other two analyze tests need the emulators.

Local emulators (see `firebase.json`): auth 9099, firestore 8180, storage 9199, UI 4000. Set `NEXT_PUBLIC_USE_EMULATORS=true` to point both the client SDK (`src/lib/firebase.ts`) and the server routes at them.

Env vars: `NEXT_PUBLIC_FIREBASE_*` (client config), `FIREBASE_SERVICE_ACCOUNT_KEY` (raw JSON or base64, server only), `OPENAI_API_KEY`, `NEXT_PUBLIC_USE_EMULATORS`.

`AGENTS.md` warns that this Next.js version has breaking changes. Read the matching guide in `node_modules/next/dist/docs/` (run `npm ci` first) before changing routing, route handlers, or config.

## Architecture

**There is no custom server.** Everything is Firebase (Auth, Firestore, Storage) from the browser, plus two Next route handlers that use `firebase-admin`:

- `src/app/api/analyze/route.ts`: the analysis pipeline (POST `{callId}`, optional `force` / `reprocess`).
- `src/app/api/debug/route.ts`: dumps recent users, calls and reports, and streams concatenated recording chunks via `?prefix=`. It has no authentication.

### Call and recording flow (spans several files)

1. `src/app/call/page.tsx` drives the call. The caller creates a `calls/{id}` doc (`status: ringing`). The callee is notified by `IncomingCallListener` and opens the same page with `role=callee`.
2. `src/lib/webrtc.ts` (`WebRTCCall`) does signaling through the Firestore subcollection `calls/{id}/signaling` (offer, answer, ICE docs). The STUN/TURN config is hardcoded, using the public openrelay TURN credentials.
3. Each client records **only its own mic**, from a clone of the local stream, with `MediaRecorder` and a 15 s timeslice. Every slice is uploaded to Storage as `recordings/{callId}/{uid}/chunk-NNNNNN.{ext}` while the call runs. On hangup, `finalizeRecording` writes `recordingChunkPrefix_{uid}`, `recordingChunkCount_{uid}` and `recordingMime_{uid}` onto the call doc. If no chunk was uploaded, it falls back to a single `recordings/{callId}/{uid}.{ext}` file. Per-speaker fields are keyed by uid at runtime, so they are not in `Call` in `src/types/index.ts`.
4. `src/lib/recording.ts` holds the pure helpers shared by client and server (paths, chunk ordering, `resolveRecording`). Keep it free of browser and Firebase imports. `resolveRecording` handles three layouts in order: chunked, per-speaker single file, legacy `recordingPath` / `partnerRecordingPath`.
5. `/call/processing` calls `POST /api/analyze` and watches `calls/{id}.analysisStatus`. The route transcribes each speaker separately (Whisper `whisper-1`, `language: 'en'`, segment timestamps), merges the segments by `start` time into `[Name]: text` lines, then runs one GPT-4o JSON call per participant. It writes a `reports` doc per participant and increments `callCount` and `totalCallMinutes` (skipped on `reprocess`).
6. The route takes a Firestore transaction lock (`analysisStatus: transcribing`) and returns 200 "Already processing" for duplicates. It also returns 200 "Waiting for partner recording" until both recordings exist, unless `force` or `reprocess` is set.

### Things that are easy to break

- `language: 'en'` in the Whisper call is deliberate. Without it Whisper detects Hebrew on accented speech and drops the English. `scripts/validate-analyze.py` greps `route.ts` for it and fails if it is removed.
- Hebrew words must come back in Hebrew script in `hebrewWords` and in inline `corrections`. This is enforced only by `SYSTEM_PROMPT` in `route.ts`, not by code.
- The transcript must keep the original alternating chronological order, with one sentence per entry. `analyze.e2e.test.ts` guards this.
- Whisper rejects files over 25 MB (`WHISPER_MAX_BYTES`). Chunks are concatenated in memory before the upload to Whisper.
- Transcription is post-call and batch only. There is no live or streaming transcript in the UI.

### Data model and rules

`src/types/index.ts` defines `UserProfile`, `Call`, `Report`, etc. Collections: `users`, `calls` (plus `signaling`), `reports`. `firestore.rules` lets clients read only their own reports and never write them. Reports are created only by the admin SDK in the analyze route. Rules and the emulator ports must stay in sync with `firebase.json`.

### Auth and shell

`AuthProvider` and `useAuth` wrap Firebase Auth. `Providers` is mounted in `src/app/layout.tsx`. `src/hooks/usePartners.ts` lists partners, with online and in-call state kept on `users/{uid}`.

Capacitor (`capacitor.config.ts`) loads the **live Railway URL** (`server.url`), not a bundled build. The `out/` dir is a stub, and web changes ship by deploying to Railway. iOS and Android are built by the GitHub Actions workflows in `.github/workflows/`. Native audio routing uses `@anuradev/capacitor-audio-toggle` (Android) and `@capgo/capacitor-audio-session` (iOS), called from `call/page.tsx`.

### Repo notes

- `IDENTITY.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `HEARTBEAT.md`, `.openclaw/` belong to an external agent workspace. They are not app code.
- Root-level `test_*.js`, `whisper_test.ts` and `get_last_report.js` are ad-hoc scripts, not part of the test suite.
- `scripts/fixtures/*.webm` are real user recordings.
- Planning docs live in `.claude/plans/` and `plans/`.
