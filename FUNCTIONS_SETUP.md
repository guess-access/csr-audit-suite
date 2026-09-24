# Audio Analyzer — Backend Setup

`audio-analyzer.html` now calls two Netlify Functions instead of talking to
Anthropic's API directly from the browser. This is required for a standalone
deploy — the direct-from-browser call only ever worked inside Claude.ai's own
artifact preview, and Claude's API doesn't accept raw audio as input anyway,
so a transcription step had to be added.

```
Browser → /api/transcribe → Deepgram (speech-to-text)
Browser → /api/analyze    → Claude (scores the transcript)
```

The browser calls `/api/*` rather than `/.netlify/functions/*` directly
because `netlify.toml` has a SPA catch-all rule (`/* → /index.html 200`)
that would otherwise match those URLs first and return HTML instead of the
function's JSON response. The `/api/*` pass-through rule in `netlify.toml`
is listed *before* the catch-all — redirect rules are processed top-to-bottom,
first match wins — and rewrites `/api/<name>` to the function
`/.netlify/functions/<name>`.

Both API keys live only on Netlify's servers (as environment variables) and
are never sent to the browser.

## 1. Get your API keys

- **Anthropic (Claude):** console.anthropic.com → API Keys
- **Deepgram (speech-to-text):** console.deepgram.com — free tier includes a
  starting credit, no card required to try it. (Any speech-to-text provider
  works here; Deepgram was picked because its REST API returns a transcript
  in a single request, no polling needed. AssemblyAI is a solid alternative
  if you'd rather use that.)

## 2. Add the keys to Netlify

In your Netlify site: **Site configuration → Environment variables → Add a
variable**, and add both:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `DEEPGRAM_API_KEY` | your Deepgram key |

Then trigger a redeploy (env var changes don't apply to already-built
deploys).

## 3. Deploy

**Netlify only bundles Functions on a real build** — a build that runs when
you deploy from a Git repo (GitHub/GitLab) or through the Netlify CLI.
Drag-and-drop manual deploys publish the HTML only and will leave the
Audio Analyzer broken (`Unexpected token '<'` errors), so:

- **Git route (recommended):** push this folder to a GitHub repo, then in
  Netlify: *Add new site → Import an existing project* and pick the repo.
  Netlify reads `netlify.toml`, picks up the `netlify/functions` folder,
  and bundles `transcribe.js` and `analyze.js` automatically.
- **CLI route:** `netlify deploy --prod` (requires Node.js installed
  locally; the CLI bundles the functions before uploading).

## 4. Test locally (optional)

```bash
npm install -g netlify-cli
netlify dev
```

This runs the site *and* the functions locally at `http://localhost:8888`,
using a `.env` file (or `netlify env:import`) for the two keys above.

## Current limits, and how to raise them later

- **Audio length:** capped at ~3MB (roughly a 3-minute MP3) in both the
  frontend and `transcribe.js`. Netlify's buffered request limit is 6MB, but
  base64-encoded payloads add ~30% overhead, giving an effective binary
  limit of ~4.5MB — 3MB stays safely inside it. For longer calls you'd need
  either: (a) compress/trim the audio before upload, or (b) move to chunked
  upload + a background function (available on paid Netlify plans, with a
  much longer execution limit).
- **One call at a time:** there's no queue — each upload is transcribed and
  scored on the spot. Fine for a manager reviewing calls one by one; not
  built for bulk/batch processing.
