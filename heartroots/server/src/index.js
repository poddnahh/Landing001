// Heartroots story-recap helper — a Cloudflare Worker.
// Receives a story transcript from the app and asks Claude for a family-keepsake recap.
// Your Anthropic API key stays here on the server; it is never sent to phones.
import Anthropic from '@anthropic-ai/sdk';

const MAX_CHARS = 120_000; // ~10 minutes of talking is far below this

const RECAP_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    highlights: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, segment: { type: 'integer' } },
        required: ['text', 'segment'],
        additionalProperties: false,
      },
    },
    moral: { type: 'string' },
    punchlines: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'summary', 'highlights', 'moral', 'punchlines'],
  additionalProperties: false,
};

const SYSTEM = `You help families keep the stories their loved ones tell. You receive the transcript of a story someone told out loud (often an older parent or grandparent), split into numbered segments from speech recognition, so expect missing punctuation and a few misheard words.

Write a recap their family will treasure:
- title: short and warm, in the storyteller's spirit (use the given story prompt if it fits).
- summary: 2–4 sentences retelling the story in plain words, in third person. Keep their voice and details; do not add facts that were not said.
- highlights: the 3–5 most vivid or meaningful moments, in the order they happened. Paraphrase lightly, and set "segment" to the number of the segment where the moment is told.
- moral: the lesson of the story in one sentence — in their words if they stated it. Use an empty string if the story has no real lesson; never invent one.
- punchlines: the funny lines or best one-liners, quoted as closely as possible. Use an empty list if nothing was funny.`;

function cors(env, extra = {}) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

const json = (env, status, body) =>
  new Response(JSON.stringify(body), { status, headers: cors(env, { 'Content-Type': 'application/json' }) });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(env) });
    if (request.method !== 'POST') return json(env, 405, { error: 'POST only' });

    let body;
    try { body = await request.json(); } catch { return json(env, 400, { error: 'Invalid JSON' }); }
    const segments = Array.isArray(body.segments) ? body.segments.map((s) => String(s)) : [];
    const prompt = String(body.prompt || '').slice(0, 300);
    if (!segments.length) return json(env, 400, { error: 'No transcript' });
    const numbered = segments.map((s, i) => `[${i}] ${s}`).join('\n');
    if (numbered.length > MAX_CHARS) return json(env, 413, { error: 'Transcript too long' });

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const response = await client.beta.messages.create({
        model: 'claude-opus-5',
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{ role: 'user', content: `Story prompt: ${prompt || '(none)'}\n\nTranscript segments:\n${numbered}` }],
        output_config: { format: { type: 'json_schema', schema: RECAP_SCHEMA } },
      });
      if (response.stop_reason === 'refusal') return json(env, 422, { error: 'The story could not be summarized' });
      if (response.stop_reason === 'max_tokens') return json(env, 502, { error: 'Recap was cut off' });
      const text = response.content.find((b) => b.type === 'text')?.text;
      const recap = JSON.parse(text);
      recap.highlights = recap.highlights.filter((h) => h.segment >= 0 && h.segment < segments.length || h.segment === -1);
      return json(env, 200, recap);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return json(env, 429, { error: 'Busy — try again in a minute' });
      if (err instanceof Anthropic.AuthenticationError) return json(env, 500, { error: 'Server API key is not set up' });
      if (err instanceof Anthropic.APIError) return json(env, 502, { error: `Claude API error ${err.status}` });
      if (err instanceof SyntaxError) return json(env, 502, { error: 'Unreadable recap' });
      throw err;
    }
  },
};
