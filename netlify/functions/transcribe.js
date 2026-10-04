// netlify/functions/transcribe.js
//
// Takes the call recording from the browser (raw binary body; the legacy
// base64 JSON shape still works too), converts it to text server-side using a
// secret API key, and returns the plain-text transcript. The scoring step
// (analyze.js) cannot accept raw audio, so transcription has to happen first.
//
// Supported keys (set in Netlify: Site settings > Environment variables):
//   GROQ_API_KEY      (free tier — recommended; uses whisper-large-v3-turbo)
//   DEEPGRAM_API_KEY  (fallback; uses nova-2)
// GROQ_API_KEY is preferred when both are present.

const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // raw audio the function accepts (~5.5MB once base64-encoded)
// Netlify's buffered request limit is 6MB. The browser re-encodes anything over
// 4MB to a 16 kHz mono MP3 before uploading (compressAudio in audio-analyzer.html),
// so every request body stays inside that cap under any encoding path.
// The original upload limit on the page is 10MB; compression happens client-side.

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const groqKey = process.env.GROQ_API_KEY;
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!groqKey && !deepgramKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'No transcription key is configured. FREE option: GROQ_API_KEY (https://console.groq.com/keys). Also supported: DEEPGRAM_API_KEY. Add one in Netlify: Site settings > Environment variables, then redeploy.',
      }),
    };
  }

  // Two accepted body shapes:
  //   - raw binary audio (Content-Type: audio/... — what audio-analyzer.html
  //     sends; no base64, so a 4MB upload stays a 4MB request)
  //   - legacy JSON { audio: '<base64>', mimeType }
  const contentType = String(
    (event.headers && (event.headers['content-type'] || event.headers['Content-Type'])) || ''
  ).toLowerCase();

  let audioBuffer;
  let mimeType;

  if (contentType.includes('application/json')) {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (err) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }
    if (!payload || !payload.audio) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing "audio" (base64) in request body' }) };
    }
    try {
      audioBuffer = Buffer.from(payload.audio, 'base64');
    } catch (err) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Could not decode base64 audio' }) };
    }
    mimeType = payload.mimeType || 'audio/mpeg';
  } else {
    // Netlify base64-encodes binary request bodies and flags them here.
    audioBuffer = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');
    mimeType = contentType || 'audio/mpeg';
  }

  if (!audioBuffer.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Empty audio body' }) };
  }

  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return {
      statusCode: 413,
      headers,
      body: JSON.stringify({
        error: `Audio file is too large for this function (${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB). Files up to 10MB are accepted on the page and compressed automatically before upload — anything still over ${(MAX_AUDIO_BYTES / 1024 / 1024).toFixed(0)}MB needs a shorter clip.`,
      }),
    };
  }

  const contentType = mimeType || 'audio/mpeg';

  try {
    if (groqKey) {
      // ---- Groq: whisper-large-v3-turbo (free tier) ----
      const form = new FormData();
      form.append('file', new Blob([audioBuffer], { type: contentType }), 'call.mp3');
      form.append('model', 'whisper-large-v3-turbo');
      form.append('response_format', 'json');

      const gResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: form,
      });
      const gData = await gResponse.json().catch(() => ({}));

      if (!gResponse.ok) {
        const message = gData?.error?.message || 'Groq transcription failed';
        return { statusCode: gResponse.status, headers, body: JSON.stringify({ error: message }) };
      }

      const transcript = (gData?.text || '').trim();
      if (!transcript) {
        return {
          statusCode: 422,
          headers,
          body: JSON.stringify({ error: 'No speech was detected in this file. Check that it\'s a valid, non-silent audio recording.' }),
        };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ transcript }) };
    }

    // ---- Deepgram: nova-2 (fallback) ----
    const dgResponse = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${deepgramKey}`,
          'Content-Type': contentType,
        },
        body: audioBuffer,
      }
    );

    const dgData = await dgResponse.json().catch(() => ({}));

    if (!dgResponse.ok) {
      const message = dgData?.err_msg || dgData?.error || 'Deepgram transcription failed';
      return { statusCode: dgResponse.status, headers, body: JSON.stringify({ error: message }) };
    }

    const transcript =
      dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

    if (!transcript.trim()) {
      return {
        statusCode: 422,
        headers,
        body: JSON.stringify({ error: 'No speech was detected in this file. Check that it\'s a valid, non-silent audio recording.' }),
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ transcript }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: `Transcription request failed: ${err.message}` }) };
  }
};
