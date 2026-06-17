/**
 * POST /api/spec — the spec generator (Vercel serverless function).
 *
 * Takes { input: string }, asks Claude to classify the concept and emit a
 * validated function-grapher spec via structured output, and returns a
 * SpecResponse. The API key stays server-side (ANTHROPIC_API_KEY) and is never
 * shipped to the browser. The deterministic correctness gate runs client-side
 * before render (src/engine/validate.ts) — this endpoint only generates.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import {
  SPEC_RESPONSE_JSON_SCHEMA,
  SPEC_SYSTEM_PROMPT,
  type SpecResponse,
} from '../src/engine/spec.ts';

const MODEL = 'claude-opus-4-8';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
  if (!input) return res.status(400).json({ error: 'Missing "input" string.' });
  if (input.length > 2000) return res.status(413).json({ error: 'Input too long.' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' });
  }

  const client = new Anthropic();

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system: SPEC_SYSTEM_PROMPT,
      // Structured output: constrain the response to our schema.
      output_config: { format: { type: 'json_schema', schema: SPEC_RESPONSE_JSON_SCHEMA } },
      messages: [{ role: 'user', content: input }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    // The JSON arrives as the final text block.
    const text = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
    if (!text) return res.status(502).json({ error: 'Model returned no spec.' });

    let parsed: SpecResponse;
    try {
      parsed = JSON.parse(text) as SpecResponse;
    } catch {
      return res.status(502).json({ error: 'Model returned malformed JSON.' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    // Map common Anthropic errors without leaking internals.
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: 'Server API key is invalid.' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'Rate limited — try again shortly.' });
    }
    const message = err instanceof Error ? err.message : 'Spec generation failed.';
    return res.status(502).json({ error: message });
  }
}
