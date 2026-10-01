// netlify/functions/transcribe.js
//
// Takes a base64-encoded audio file from the browser, sends it to Deepgram's
// speech-to-text API (server-side, using a secret API key), and returns the
// plain-text transcript. Claude's Messages API does not accept raw audio as
// input, so this step has to happen before anything gets to Claude.
//
// Required environment variable (set in Netlify: Site settings > Environment
// variables): DEEPGRAM_API_KEY

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

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'DEEPGRAM_API_KEY is not set. Add it in Netlify: Site settings > Environment variables, then redeploy.',
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { audio, mimeType } = payload;
  if (!audio) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing "audio" (base64) in request body' }) };
  }

  let audioBuffer;
  try {
    audioBuffer = Buffer.from(audio, 'base64');
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Could not decode base64 audio' }) };
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

  try {
    const dgResponse = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': mimeType || 'audio/mpeg',
        },
        body: audioBuffer,
      }
    );

    const dgData = await dgResponse.json();

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
