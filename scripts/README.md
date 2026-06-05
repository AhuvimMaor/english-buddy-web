# Analysis pipeline regression check

`validate-analyze.py` runs two real recorded speakers through the **same**
transcription config and tutor prompt the production route uses (read live from
`src/app/api/analyze/route.ts`) and asserts the report is healthy.

It guards the regression where Whisper was called without `language: 'en'` and
transcribed mixed/accented speech as **Hebrew-only**, producing Hebrew-only
reports with wrong fluency scores.

## Run it

```bash
export OPENAI_API_KEY=sk-...        # only requirement
python3 scripts/validate-analyze.py
# or: npm run validate:analyze
```

Exit code `0` = healthy. Non-zero = regression (with a message saying what broke).

## What it checks
- `route.ts` still pins transcription to `language: 'en'` (hard fail if removed).
- Transcription actually contains English (not dropped to Hebrew-only).
- Hebrew words are still detected and returned in Hebrew script.
- Each speaker's report has a 1–10 fluency score, a non-empty transcript, and tips.
- At least one grammar correction is produced across the call.

## Notes
- Only dependency is `python3` + an OpenAI API key. No gcloud / Railway / Firebase.
- Costs a few cents per run (Whisper + 2× GPT-4o calls). Non-deterministic LLM
  output is tolerated via structural (not exact-string) assertions.
- `fixtures/maya.webm` and `fixtures/maor.webm` are **real user recordings**.
  Keep this repo private; remove them if that's a concern.
