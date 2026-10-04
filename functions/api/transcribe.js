// functions/api/transcribe.js — Cloudflare Pages Function (POST /api/transcribe)
//
// Receives the call recording from audio-analyzer.html and returns the plain
// text transcript. The default path takes the RAW BINARY body (what the page
// sends now — no base64, so a multi-megabyte upload stays well inside the
// worker's CPU budget); a legacy JSON body { audio: '<base64>', mimeType }
// is still accepted so older clients keep working.
//
// Keys (Cloudflare Pages → Settings → Environment variables):
//   GROQ_API_KEY      (free tier — preferred; whisper-large-v3-turbo)
//   DEEPGRAM_API_KEY  (fallback; nova-2)

const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // keep in sync with UPLOAD_RAW_MAX in audio-analyzer.html

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

function decodeBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  const groqKey = env.GROQ_API_KEY;
  const deepgramKey = env.DEEPGRAM_API_KEY;
  if (!groqKey && !deepgramKey) {
    return json(500, {
      error:
        'No transcription key is configured. FREE option: GROQ_API_KEY (https://console.groq.com/keys). ' +
        'Also supported: DEEPGRAM_API_KEY. Add one in Cloudflare Pages: Settings > Environment variables, then redeploy.',
    });
  }

  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  let bytes;
  let mimeType;

  if (contentType.includes('application/json')) {
    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      return json(400, { error: 'Invalid JSON body' });
    }
    if (!payload || !payload.audio) {
      return json(400, { error: 'Missing "audio" (base64) in request body' });
    }
    try {
      bytes = decodeBase64(payload.audio);
    } catch (err) {
      return json(400, { error: 'Could not decode base64 audio' });
    }
    mimeType = payload.mimeType || 'audio/mpeg';
  } else {
    bytes = new Uint8Array(await request.arrayBuffer());
    mimeType = contentType || 'audio/mpeg';
  }

  if (!bytes.byteLength) {
    return json(400, { error: 'Empty audio body' });
  }
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return json(413, {
      error: `Audio file is too large for this function (${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB). Files up to 10MB are accepted on the page and compressed automatically before upload — anything still over ${(MAX_AUDIO_BYTES / 1024 / 1024).toFixed(0)}MB needs a shorter clip.`,
    });
  }

  try {
    if (groqKey) {
      // ---- Groq: whisper-large-v3-turbo (free tier) ----
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mimeType }), 'call.mp3');
      form.append('model', 'whisper-large-v3-turbo');
      form.append('response_format', 'json');

      const gResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: form,
      });
      const gData = await gResponse.json().catch(() => ({}));

      if (!gResponse.ok) {
        return json(gResponse.status, {
          error: (gData && gData.error && gData.error.message) || 'Groq transcription failed',
        });
      }

      const transcript = ((gData && gData.text) || '').trim();
      if (!transcript) {
        return json(422, {
          error: "No speech was detected in this file. Check that it's a valid, non-silent audio recording.",
        });
      }
      return json(200, { transcript });
    }

    // ---- Deepgram: nova-2 (fallback) ----
    const dgResponse = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${deepgramKey}`,
          'Content-Type': mimeType,
        },
        body: bytes,
      }
    );
    const dgData = await dgResponse.json().catch(() => ({}));

    if (!dgResponse.ok) {
      return json(dgResponse.status, {
        error: (dgData && (dgData.err_msg || dgData.error)) || 'Deepgram transcription failed',
      });
    }

    const transcript =
      (dgData &&
        dgData.results &&
        dgData.results.channels &&
        dgData.results.channels[0] &&
        dgData.results.channels[0].alternatives &&
        dgData.results.channels[0].alternatives[0] &&
        dgData.results.channels[0].alternatives[0].transcript) ||
      '';

    if (!transcript.trim()) {
      return json(422, {
        error: "No speech was detected in this file. Check that it's a valid, non-silent audio recording.",
      });
    }
    return json(200, { transcript });
  } catch (err) {
    return json(502, { error: `Transcription request failed: ${err.message}` });
  }
}
