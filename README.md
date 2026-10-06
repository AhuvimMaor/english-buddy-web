# English Buddy

Voice-call practice for Hebrew speakers learning English. Two people call each other over WebRTC, see live captions (Hebrew words highlighted), and get an AI report afterwards: grammar fixes, fluency score, tips, and a table of the Hebrew words they used with English translations.

Built with Next.js 16, Firebase (Auth, Firestore, Storage), OpenAI (Whisper + GPT-4o), and Capacitor for iOS and Android.

## Develop

```bash
cp .env.example .env.local   # fill in the values
npm ci
npm run dev                  # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Unit and mocked end-to-end tests |
| `npm run test:integration` | Storage/Firestore emulator tests (needs Java) |
| `npm run validate:analyze` | Real-audio regression check (needs `OPENAI_API_KEY`) |

## How a call works

1. The caller creates a `calls/{id}` document; the callee gets a ringing prompt.
2. WebRTC signaling goes through `calls/{id}/signaling`.
3. Each phone records only its own mic and uploads 15 second chunks to Storage while the call runs.
4. Every few seconds a short segment of the mic is sent to `/api/live-caption`, transcribed, and shown to both people. Silent segments are skipped.
5. After hang-up, `/api/analyze` transcribes both recordings with Whisper, merges them in time order, and asks GPT-4o for one report per person.

## Production checklist

- Set every variable in `.env.example`. `INTERNAL_API_SECRET` must be a long random string.
- Deploy `firestore.rules` and `storage.rules` (`firebase deploy --only firestore:rules,storage`). The app relies on them: users can only read their own calls, recordings and reports.
- Use your own TURN server (`NEXT_PUBLIC_TURN_*`). The built-in public relay is for development only.
- `/api/analyze` and `/api/live-caption` need a Firebase ID token and are rate limited per user. The limiter is in memory, so use a shared store if you run more than one instance.
- Health check: `GET /api/health`.
- The mobile apps load the live Railway URL (`capacitor.config.ts`), so web changes ship by deploying the site.
