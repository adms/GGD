// Research pipeline contract: provider adapters must supply an explicit final channel.
// This module never searches reasoning or arbitrary prose for a JSON substring.
export function parseUniqueObject(text) {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('ROOT_NOT_OBJECT');
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] ?? '') && i < text.length) i++; };
  function string() {
    const start = i++;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i++] === '"') return JSON.parse(text.slice(start, i));
    }
    throw Error('UNTERMINATED_STRING');
  }
  function visit(depth) {
    if (depth > 64) throw Error('JSON_TOO_DEEP');
    ws();
    if (text[i] === '{') {
      i++; ws(); const keys = new Set();
      if (text[i] === '}') { i++; return; }
      while (true) {
        ws(); const key = string();
        if (keys.has(key)) throw Error('DUPLICATE_JSON_KEY');
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('UNSAFE_JSON_KEY');
        keys.add(key); ws(); i++; visit(depth + 1); ws();
        if (text[i++] === '}') return;
      }
    }
    if (text[i] === '[') {
      i++; ws(); if (text[i] === ']') { i++; return; }
      while (true) { visit(depth + 1); ws(); if (text[i++] === ']') return; }
    }
    if (text[i] === '"') { string(); return; }
    const start = i;
    while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
    const atom = JSON.parse(text.slice(start, i));
    if (typeof atom === 'number' && !Number.isFinite(atom)) throw Error('NONFINITE_JSON_NUMBER');
  }
  visit(0);
  return value;
}

export function normalizeFinal(envelope, { maxBytes = 1024 * 1024 } = {}) {
  const fail = error => ({ ok: false, error, value: null, unwrapped: false });
  if (envelope?.finishReason !== 'stop') return fail('GENERATION_NOT_COMPLETE');
  if (envelope?.channel !== 'final') return fail('EXPLICIT_FINAL_REQUIRED');
  if (typeof envelope?.text !== 'string') return fail('FINAL_TEXT_REQUIRED');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return fail('INVALID_SIZE_LIMIT');
  if (Buffer.byteLength(envelope.text) > maxBytes) return fail('FINAL_TOO_LARGE');
  const final = envelope.text.trim();
  const fence = final.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/);
  const jsonText = fence ? fence[1] : final;
  try {
    return { ok: true, error: null, value: parseUniqueObject(jsonText), unwrapped: Boolean(fence),
      jsonText, semanticQualified: false, releaseQualified: false };
  } catch (error) { return fail(error.message); }
}
