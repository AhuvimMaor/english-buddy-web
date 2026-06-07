#!/usr/bin/env python3
"""
Independent regression check for the call-analysis pipeline.

Runs two REAL recorded speakers (scripts/fixtures/maya.webm + maor.webm) through
the SAME transcription config and tutor prompt that production uses (parsed live
from src/app/api/analyze/route.ts), then asserts the resulting report is healthy:
English is captured (not dropped to Hebrew-only), Hebrew words are preserved,
and grammar / word corrections + fluency are produced.

This guards the regression where Whisper was called without `language: 'en'` and
transcribed mixed/accented speech as Hebrew-only, yielding Hebrew-only reports.

USAGE
  export OPENAI_API_KEY=sk-...
  python3 scripts/validate-analyze.py

Exit code 0 = all checks passed. Non-zero = a regression was detected.
Only dependency: python3 + the OpenAI API key. No gcloud / Railway / Firebase needed.
"""
import json, os, re, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ROUTE = os.path.join(ROOT, "src/app/api/analyze/route.ts")
FIXTURES = os.path.join(HERE, "fixtures")

# caller/callee + display name, matching how the route labels per-speaker tracks.
SPEAKERS = [
    {"file": "maya.webm", "name": "maya", "role": "caller"},
    {"file": "maor.webm", "name": "Maor", "role": "callee"},
]

HEBREW = re.compile(r"[֐-׿]")
LATIN = re.compile(r"[A-Za-z]")


def die(msg):
    print(f"\n❌ REGRESSION: {msg}")
    sys.exit(1)


def get_key():
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        print("Set OPENAI_API_KEY first (export OPENAI_API_KEY=sk-...).")
        sys.exit(2)
    return key


def parse_route():
    """Read the prompt + transcription config from the route so this test tracks
    the real source of truth (and fails if `language: 'en'` is removed)."""
    src = open(ROUTE, encoding="utf-8").read()
    system_prompt = re.search(r"const SYSTEM_PROMPT = `(.*?)`;", src, re.S)
    if not system_prompt:
        die("could not find SYSTEM_PROMPT in route.ts")
    # transcription create block
    block = re.search(r"transcriptions\.create\(\{(.*?)\}\)", src, re.S)
    block_txt = block.group(1) if block else ""
    lang = re.search(r"language:\s*['\"]([a-zA-Z-]+)['\"]", block_txt)
    tprompt = re.search(r"prompt:\s*'([^']*)'", block_txt)
    return {
        "system_prompt": system_prompt.group(1),
        "language": lang.group(1) if lang else None,
        "transcribe_prompt": tprompt.group(1) if tprompt else "",
    }


def transcribe(key, path, cfg):
    args = [
        "curl", "-s", "https://api.openai.com/v1/audio/transcriptions",
        "-H", f"Authorization: Bearer {key}",
        "-F", f"file=@{path}",
        "-F", "model=whisper-1",
        "-F", "response_format=verbose_json",
        "-F", "timestamp_granularities[]=segment",
    ]
    if cfg["language"]:
        args += ["-F", f"language={cfg['language']}"]
    if cfg["transcribe_prompt"]:
        args += ["-F", f"prompt={cfg['transcribe_prompt']}"]
    out = subprocess.run(args, capture_output=True, text=True).stdout
    return json.loads(out)


def analyze(key, name, role, transcription, system_prompt):
    body = json.dumps({
        "model": "gpt-4o",
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f'Analyze this conversation for "{name}" (the {role}). '
             f'Find THEIR grammar mistakes, Hebrew words, and score THEIR fluency. '
             f'Show the full conversation but corrections only for their lines.\n\n{transcription}'},
        ],
    }).encode()
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    resp = json.load(urllib.request.urlopen(req, timeout=180))
    return json.loads(resp["choices"][0]["message"]["content"])


def main():
    key = get_key()
    cfg = parse_route()
    print(f"Config from route.ts -> language={cfg['language']!r}")
    if cfg["language"] != "en":
        die("route.ts no longer pins Whisper to language='en' — mixed/accented "
            "speech will be transcribed Hebrew-only. Re-add `language: 'en'`.")

    # 1) Transcribe each speaker, merge into a labeled, time-sorted transcript.
    segs = []
    for sp in SPEAKERS:
        path = os.path.join(FIXTURES, sp["file"])
        if not os.path.exists(path):
            die(f"missing fixture {path}")
        r = transcribe(key, path, cfg)
        for s in (r.get("segments") or [{"start": 0, "text": r.get("text", "")}]):
            segs.append((s.get("start", 0), sp["name"], s["text"].strip()))
    segs.sort(key=lambda x: x[0])
    transcription = "\n".join(f"[{n}]: {t}" for _, n, t in segs)
    print("\n----- TRANSCRIPTION -----\n" + transcription + "\n")

    # Core regression checks on the transcription.
    if not LATIN.search(transcription):
        die("transcription contains no English at all (Hebrew-only).")
    latin = len(LATIN.findall(transcription))
    if latin < 40:
        die(f"transcription has almost no English ({latin} latin chars) — English is being dropped.")
    if not HEBREW.search(transcription):
        print("⚠️  note: no Hebrew characters in transcription (ok if none was spoken).")

    # 2) Run the analysis for each speaker and check the report contract.
    reports = []
    for sp in SPEAKERS:
        a = analyze(key, sp["name"], sp["role"], transcription, cfg["system_prompt"])
        reports.append((sp["name"], a))
        fs = a.get("fluencyScore")
        print(f"[{sp['name']}] fluency={fs} grammarMistakes={len(a.get('grammarMistakes',[]))} "
              f"hebrewWords={len(a.get('hebrewWords',[]))} transcript={len(a.get('transcript',[]))} "
              f"tips={len(a.get('tips',[]))}")
        if not isinstance(fs, (int, float)) or not (1 <= fs <= 10):
            die(f"{sp['name']}: fluencyScore missing/out of range ({fs}).")
        tr = a.get("transcript", [])
        if len(tr) == 0:
            die(f"{sp['name']}: empty transcript in report.")
        if len(a.get("tips", [])) == 0:
            die(f"{sp['name']}: no tips in report.")
        # Chronological-order regression: a transcript grouped by speaker (all of
        # one speaker, then the other) has ~1 transition. A real back-and-forth
        # conversation alternates many times. Guards commit 05ee7c4.
        sp_seq = [e.get("speaker") for e in tr if e.get("speaker")]
        transitions = sum(1 for i in range(1, len(sp_seq)) if sp_seq[i] != sp_seq[i - 1])
        print(f"  speaker transitions: {transitions} across {len(tr)} entries")
        if len(tr) >= 4 and transitions < 3:
            die(f"{sp['name']}: transcript looks GROUPED by speaker "
                f"({transitions} transitions across {len(tr)} entries) — the report "
                f"must preserve the chronological alternating conversation order.")

    # 3) Across the call there must be at least one grammar correction AND one
    #    Hebrew word detected (the maya track has both).
    total_grammar = sum(len(a.get("grammarMistakes", [])) for _, a in reports)
    hebrew_words = [w for _, a in reports for w in a.get("hebrewWords", [])]
    if total_grammar == 0:
        die("no grammar mistakes detected on either speaker (tutor analysis broken).")
    if not hebrew_words:
        die("no Hebrew words detected (mixed-language detection broken).")
    if not any(HEBREW.search(str(w.get("hebrew", ""))) for w in hebrew_words):
        die("hebrewWords present but none in Hebrew script (transliteration not converted).")

    print(f"\n✅ PASS — English captured ({latin} latin chars), Hebrew preserved, "
          f"{total_grammar} grammar correction(s), {len(hebrew_words)} Hebrew word(s), "
          f"chronological order kept, fluency + tips present on both speakers.")


if __name__ == "__main__":
    main()
