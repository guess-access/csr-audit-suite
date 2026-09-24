// netlify/functions/analyze.js
//
// Takes a call transcript (plain text, produced by transcribe.js) and scores
// it against the Dealerfocus Call Quality QA form using Claude. The Anthropic
// API key lives here, server-side, and is never sent to the browser.
//
// QA form rules encoded below (matches the interactive form exactly):
//   - 18 metrics across 5 sections, 100 pts total, 85% passing threshold
//   - Metrics 1-8: full points or 0 (binary)
//   - Metric 9 (Hold Procedure): full points, 0, or N/A (N/A = 0 pts)
//   - Metrics 10-15: full (5) / Partial (3) / No (0)
//   - Metrics 16-18 (Zero Tolerance): "auto-fail" triggers grade 0 + PIP review
//
// Claude returns observations, but the numbers are re-derived server-side by
// normalize() so the score always follows the form's arithmetic — the model
// can never award points the form wouldn't.
//
// Required environment variable (set in Netlify: Site settings > Environment
// variables): ANTHROPIC_API_KEY

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
      // No usable status — fall back to the reported number, clamped.
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
      status = statusRaw ? 'fail' : 'fail';
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

  // Section subtotals straight from the normalized metrics.
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'ANTHROPIC_API_KEY is not set. Add it in Netlify: Site settings > Environment variables, then redeploy.',
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { transcript, agentName, callDate } = payload;
  if (!transcript || !transcript.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing "transcript" in request body' }) };
  }

  const prompt = `You are a QA auditor for a dealership customer service team. Score this call transcript against the Dealerfocus Call Quality QA form, then write specific coaching feedback for the agent.

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
- Base the evaluation on the transcript evidence; note it when the agent's identity vs the customer's is ambiguous.

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

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error?.message || 'Claude API request failed';
      return { statusCode: response.status, headers, body: JSON.stringify({ error: message }) };
    }

    const textContent = data?.content?.map((c) => c.text || '').join('') || '';
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Claude did not return a parseable analysis' }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Claude returned invalid JSON' }) };
    }

    // Scores are always recomputed with the QA form's arithmetic.
    const analysis = normalize(parsed);
    return { statusCode: 200, headers, body: JSON.stringify({ analysis }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: `Analysis request failed: ${err.message}` }) };
  }
};
