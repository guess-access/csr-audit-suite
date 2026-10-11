// functions/api/analyze.js — Cloudflare Pages Function (POST /api/analyze)
//
// Takes a call transcript (plain text, produced by transcribe.js) and scores
// it against the Dealerfocus Call Quality QA form, then writes coaching
// feedback. API keys live here, server-side, and are never sent to the
// browser.
//
// Provider selection — first key found wins, so you only need ONE scoring key:
//   GROQ_API_KEY     (Groq free tier — no credit card)
//   GEMINI_API_KEY   (Google Gemini free tier — no credit card)
//   ANTHROPIC_API_KEY (Claude — paid, optional)
//
// QA form rules encoded below (matches the interactive form exactly):
//   - 18 metrics across 5 sections, 100 pts total, 85% passing threshold
//   - Metrics 1-8: full points or 0 (binary)
//   - Metric 9 (Hold Procedure): full points, 0, or N/A (N/A = 0 pts)
//   - Metrics 10-15: full (5) / Partial (3) / No (0)
//   - Metrics 16-18 (Zero Tolerance): "auto-fail" triggers grade 0 + PIP review
//
// The model returns observations, but the numbers are re-derived here by
// normalize() so the score always follows the form's arithmetic — the model
// can never award points the form wouldn't.

// Points possible per metric (16-18 are zero-tolerance: no point value).
const POSSIBLE = {
  1: 10, 2: 10, 3: 8, 4: 8, 5: 8, 6: 8, 7: 5, 8: 8,
  9: 5, 10: 5, 11: 5, 12: 5, 13: 5, 14: 5, 15: 5,
  16: 0, 17: 0, 18: 0,
};

const SECTIONS = [
  { id: 's1', name: '1 — Call Flow Procedure', ids: [1, 2] },
  { id: 's2', name: '2 — Body of the Call', ids: [3, 4, 5] },
  { id: 's3', name: '3 — System Process Accuracy', ids: [6, 7, 8] },
  { id: 's4', name: '4 — Call Management Skills', ids: [9, 10, 11, 12, 13, 14, 15] },
  { id: 's5', name: '5 — Zero Tolerance Behavior', ids: [16, 17, 18] },
];

const PASSING_THRESHOLD = 85;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Convert one raw metric from the model into the form's arithmetic.
function normalizeMetric(id, raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const possible = POSSIBLE[id];
  const statusRaw = String(raw.status || '').toLowerCase().trim();

  let status;
  let earned;

  if (id >= 16) {
    // Zero tolerance: any flavor of "fail" means the behavior was observed.
    if (['auto-fail', 'auto_fail', 'autofail', 'fail', 'triggered', 'yes'].includes(statusRaw)) {
      status = 'auto-fail';
      earned = 0;
    } else {
      status = 'not-observed';
      earned = 0;
    }
  } else if (id <= 8) {
    // Binary: full points or nothing (the form offers no partial credit here).
    if (['pass', 'yes', 'full', 'full points'].includes(statusRaw)) {
      status = 'pass';
      earned = possible;
    } else if (statusRaw) {
      status = statusRaw === 'na' || statusRaw === 'n/a' ? 'na' : 'fail';
      earned = 0;
    } else {
      const n = Number(raw.score_earned);
      earned = Number.isFinite(n) ? clamp(Math.round(n), 0, possible) : 0;
      status = earned >= possible ? 'pass' : earned > 0 ? 'partial' : 'fail';
    }
  } else if (id === 9) {
    if (['pass', 'yes'].includes(statusRaw)) {
      status = 'pass';
      earned = possible;
    } else if (['na', 'n/a'].includes(statusRaw)) {
      status = 'na';
      earned = 0;
    } else {
      status = 'fail';
      earned = 0;
    }
  } else {
    // Metrics 10-15: full (5) / partial (3) / no (0).
    if (['pass', 'yes'].includes(statusRaw)) {
      status = 'pass';
      earned = possible;
    } else if (['partial', 'partially'].includes(statusRaw)) {
      status = 'partial';
      earned = 3;
    } else {
      status = 'fail';
      earned = 0;
    }
  }

  return {
    id,
    metric: typeof raw.metric === 'string' && raw.metric.trim() ? raw.metric.trim() : `Metric ${id}`,
    status,
    score_earned: earned,
    score_possible: possible,
    observation: typeof raw.observation === 'string' ? raw.observation.trim() : '',
    recommendation: typeof raw.recommendation === 'string' ? raw.recommendation.trim() : '',
  };
}

// Rebuild the whole result object from the form's rules.
function normalize(analysis) {
  const rawMetrics = Array.isArray(analysis.metrics) ? analysis.metrics : [];
  const byId = {};
  rawMetrics.forEach((m, i) => {
    const id = m && m.id != null ? Number(m.id) : i + 1;
    if (id >= 1 && id <= 18 && byId[id] === undefined) byId[id] = m;
  });

  const metrics = [];
  for (let id = 1; id <= 18; id++) {
    metrics.push(normalizeMetric(id, byId[id]));
  }

  const sections = SECTIONS.map((sec) => {
    const earned = sec.ids.reduce((sum, id) => sum + metrics[id - 1].score_earned, 0);
    const possible = sec.ids.reduce((sum, id) => sum + POSSIBLE[id], 0);
    return { id: sec.id, name: sec.name, earned, possible };
  });

  const autoFailItems = metrics
    .filter((m) => m.status === 'auto-fail')
    .map((m) => m.id);
  const autoFail = autoFailItems.length > 0;

  const total = metrics
    .filter((m) => m.id <= 15)
    .reduce((sum, m) => sum + m.score_earned, 0);
  const grade = autoFail ? 0 : total;

  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
  const suggestions = Array.isArray(analysis.coaching_suggestions)
    ? analysis.coaching_suggestions
        .filter((s) => s && typeof s === 'object')
        .map((s) => ({
          area: String(s.area || '').trim(),
          suggestion: String(s.suggestion || '').trim(),
          example: String(s.example || '').trim(),
        }))
        .filter((s) => s.suggestion)
    : [];

  return {
    overall_score: total,
    grade_pct: grade,
    passed: !autoFail && grade >= PASSING_THRESHOLD,
    passing_threshold: PASSING_THRESHOLD,
    auto_fail: {
      triggered: autoFail,
      items: autoFailItems,
      note: autoFail
        ? 'Zero-tolerance behavior observed — grade is 0% and the call requires PIP enrollment review.'
        : '',
    },
    reason_for_call: typeof analysis.reason_for_call === 'string' ? analysis.reason_for_call.trim() : '',
    sections,
    metrics,
    strengths: arr(analysis.strengths),
    opportunities: arr(analysis.opportunities),
    concerns: arr(analysis.concerns),
    recommended_actions: arr(analysis.recommended_actions),
    coaching_suggestions: suggestions,
    coaching_notes:
      typeof analysis.coaching_notes === 'string' && analysis.coaching_notes.trim()
        ? analysis.coaching_notes.trim()
        : arr(analysis.opportunities).join(' '),
  };
}

/* ---------------- providers ---------------- */

function pickProvider(env) {
  if (env.GROQ_API_KEY) return 'groq';
  if (env.GEMINI_API_KEY) return 'gemini';
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

const NO_KEY_MESSAGE =
  'No scoring AI key is configured. FREE options (no credit card): ' +
  'GROQ_API_KEY — create at https://console.groq.com/keys, or ' +
  'GEMINI_API_KEY — create at https://aistudio.google.com/apikey. ' +
  '(Paid option: ANTHROPIC_API_KEY.) Add one in Cloudflare Pages: Settings > Environment variables, then redeploy.';

async function callGemini(prompt, env) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Gemini: ${data?.error?.message || `HTTP ${res.status} ${data?.error?.status || ''}`}`
    );
  }
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('');
  if (!text.trim()) throw new Error('Gemini returned an empty response');
  return text;
}

async function callGroq(prompt, env) {
  const model = env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a dealership QA auditor. You reply with valid JSON only — no markdown, no commentary.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Groq: ${data?.error?.message || `HTTP ${res.status}`}`);
  }
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('Groq returned an empty response');
  return text;
}

async function callAnthropic(prompt, env) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Claude: ${data?.error?.message || `HTTP ${res.status}`}`);
  }
  const text = (data?.content || []).map((c) => c.text || '').join('');
  if (!text.trim()) throw new Error('Claude returned an empty response');
  return text;
}

function buildPrompt(agentName, callDate, transcript) {
  return `You are a QA auditor for a dealership customer service team. Score this call transcript against the Dealerfocus Call Quality QA form, then write specific coaching feedback for the agent.

Agent: ${agentName || 'Unknown'}
Call date: ${callDate || 'Unknown'}

Transcript:
"""
${transcript}
"""

SCORING RULES (apply exactly):
- 18 metrics, 100 points total, passing threshold 85%.
- Metrics 1-8 are BINARY: status "pass" = full points, otherwise 0.
  1. Announced the dealership name (10)
  2. Introduced themselves by name (10)
  3. Asked the customer the reason for the transfer (8)
  4. Asked for the customer's name (8)
  5. Introduced the customer to Service/Parts before transferring (8)
  6. Warm transfer protocol: hold 3 rings, wait for someone to answer before releasing (8)
  7. Data entered correctly: first/last name + phone number (5)
  8. Correct call disposition selected (8)
- Metric 9 (Hold Procedure, 5 pts): status "pass", "fail", or "na" if no hold occurred. N/A scores 0.
- Metrics 10-15 (5 pts each): status "pass" = 5, "partial" = 3, "fail" = 0.
  10. Communication & Delivery — clear enunciation, no jargon, fluid
  11. Empathy — acknowledged the customer's emotion
  12. Active Listening — no repetition, attention to detail
  13. Tone of Voice — accommodating, willing to help
  14. Efficiency — concise in delivering the resolution
  15. Confidence — certain, accurate, reassured the customer
- Metrics 16-18 are ZERO TOLERANCE: status "auto-fail" only if the behavior is clearly present in the transcript, otherwise "not-observed".
  16. Rudeness — profanity, condescending statements or tone, consistently interrupting
  17. Service Fail — booked when policy says Do Not Book (or vice versa), wrong appointment date/time, failed to confirm transportation option, or no appointment scheduled
  18. Call Avoidance — disconnecting intentionally
- Judge ONLY what the transcript supports. System actions that cannot be heard (data entry, disposition selection, hold timing) score 0 unless the transcript clearly confirms them — say in the observation that it needs manual verification.

Respond ONLY with valid JSON in exactly this shape:
{
  "reason_for_call": "one sentence — why the customer called",
  "metrics": [
    {"id": 1, "metric": "short name", "status": "pass|fail|partial|na|not-observed|auto-fail", "score_earned": 0, "observation": "one sentence of evidence, quote the transcript where possible", "recommendation": "concrete fix for this metric, or empty string if passed"}
  ],
  "strengths": ["2-4 things the agent did well, specific"],
  "opportunities": ["1-4 areas to improve, specific"],
  "concerns": ["policy or quality risks, empty array if none"],
  "recommended_actions": ["3-5 prioritized, actionable steps for the agent"],
  "coaching_suggestions": [
    {"area": "skill area", "suggestion": "exactly what to do differently next call", "example": "a short word-for-word phrase the agent could use"}
  ],
  "coaching_notes": "4-6 sentence coaching summary: what happened, what to praise, what to change, and the single most important focus for the next call"
}

Rules for the JSON: include all 18 metrics in order with id 1-18; score_earned must follow the rules above; every coaching_suggestions entry must have area, suggestion, and example; respond with JSON only, no markdown, no commentary.`;
}

// Dispute pass: re-check only the metrics a human reviewer challenged, using the
// transcript plus the reviewer's claimed scores as context. The transcript stays
// the final authority, but the reviewer gets a fair hearing on non-audible
// system actions and genuinely inapplicable steps.
function buildDisputePrompt(transcript, metrics, disputes) {
  const orig = (Array.isArray(metrics) ? metrics : [])
    .filter((m) => m && Number.isInteger(Number(m.id)))
    .slice(0, 18)
    .map((m) => ({
      id: Number(m.id),
      status: String(m.status || ''),
      score_earned: Number(m.score_earned) || 0,
      observation: String(m.observation || '').slice(0, 220),
    }));
  return `You are a QA auditor for a dealership customer service team. A human reviewer has challenged some of the original AI verdicts on this call. Re-check ONLY the disputed metrics against the transcript.

Transcript:
"""
${transcript}
"""

ORIGINAL VERDICTS (JSON):
${JSON.stringify(orig)}

REVIEWER DISPUTES (JSON — the reviewer's claimed score for each disputed metric):
${JSON.stringify(disputes)}

FORM RULES (apply exactly):
- Metrics 1-8 are BINARY: "pass" = full points (1:10, 2:10, 3:8, 4:8, 5:8, 6:8, 7:5, 8:8), otherwise 0.
- Metric 9 (Hold Procedure, 5 pts): "pass", "fail", or "na" if no hold occurred (na = 0 pts).
- Metrics 10-15 (5 pts each): "pass" = 5, "partial" = 3, "fail" = 0.
- Metrics 16-18 are ZERO TOLERANCE (0 pts): "auto-fail" only if the behavior is clearly present in the transcript, else "not-observed".
- Metric meanings: 1 dealership name, 2 agent name, 3 reason for transfer, 4 customer name, 5 intro to Service/Parts before transferring, 6 warm transfer (hold 3 rings, wait for answer), 7 data entered correctly (first/last name + phone), 8 correct disposition, 9 hold procedure, 10 communication & delivery, 11 empathy, 12 active listening, 13 tone of voice, 14 efficiency, 15 confidence, 16 rudeness, 17 service fail, 18 call avoidance.

TASK — for EACH disputed id only:
1. Re-read the transcript evidence for that metric.
2. Weigh the reviewer's claimed score and reason. The transcript is the final authority, but be fair to the reviewer: metrics that genuinely do not apply to this call (for example transfer steps on a call with no transfer) should be "adjusted" to "na"; system actions that cannot be heard (data entry, disposition, hold timing) should be "adjusted" when the reviewer plausibly explains what actually happened.
3. Decide: "upheld" (the original verdict stands) or "adjusted" (the original verdict was wrong).
4. If adjusted, give the corrected "status" and "score_earned" following the form rules exactly.
5. "justification": one sentence citing transcript evidence or accepting the reviewer's reasoning.

Respond ONLY with valid JSON:
{"disputes":[{"id":3,"decision":"upheld|adjusted","status":"corrected status","score_earned":0,"justification":"one sentence"}]}
Include exactly one entry per disputed id, in the same order, with no other text.`;
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    // Tolerate fenced or slightly malformed output before giving up.
    const cleaned = match[0].replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (err2) {
      return null;
    }
  }
}

/* ---------------- handlers ---------------- */

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  const provider = pickProvider(env);
  if (!provider) {
    return json(500, { error: NO_KEY_MESSAGE });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return json(400, { error: 'Invalid JSON body' });
  }

  const { transcript, agentName, callDate, disputes, metrics } = payload || {};
  if (!transcript || !transcript.trim()) {
    return json(400, { error: 'Missing "transcript" in request body' });
  }

  // Optional dispute pass: re-check only the metrics a reviewer challenged.
  const disputeList = (Array.isArray(disputes) ? disputes : [])
    .filter((d) => d && Number.isInteger(Number(d.id)) && Number(d.id) >= 1 && Number(d.id) <= 18)
    .slice(0, 18)
    .map((d) => ({
      id: Number(d.id),
      claimed_status: String(d.claimed_status || '').toLowerCase().trim().slice(0, 20),
      reason: String(d.reason || '').slice(0, 500),
    }));

  const prompt = disputeList.length
    ? buildDisputePrompt(transcript, metrics, disputeList)
    : buildPrompt(agentName, callDate, transcript);

  try {
    let rawText;
    if (provider === 'groq') {
      rawText = await callGroq(prompt, env);
    } else if (provider === 'gemini') {
      rawText = await callGemini(prompt, env);
    } else {
      rawText = await callAnthropic(prompt, env);
    }

    const parsed = extractJson(rawText);
    if (!parsed) {
      return json(502, { error: `${provider} did not return a parseable ${disputeList.length ? 'dispute response' : 'analysis'}` });
    }

    if (disputeList.length) {
      const out = Array.isArray(parsed.disputes) ? parsed.disputes : [];
      if (!out.length) {
        return json(502, { error: `${provider} did not return a parseable dispute response` });
      }
      // Scores are always recomputed with the QA form's arithmetic.
      const resolutions = disputeList.map((d) => {
        const hit = out.find((x) => x && Number(x.id) === d.id) || {};
        const decision = String(hit.decision || '').toLowerCase().trim() === 'adjusted' ? 'adjusted' : 'upheld';
        const justification = typeof hit.justification === 'string' ? hit.justification.trim() : '';
        if (decision === 'adjusted') {
          const m = normalizeMetric(d.id, hit);
          return { id: d.id, decision, status: m.status, score_earned: m.score_earned, justification };
        }
        return { id: d.id, decision: 'upheld', justification };
      });
      return json(200, { disputes: resolutions, provider });
    }

    // Scores are always recomputed with the QA form's arithmetic.
    const analysis = normalize(parsed);
    return json(200, { analysis, provider });
  } catch (err) {
    return json(502, { error: `Analysis request failed: ${err.message}` });
  }
}
