// Output contract:
//   stdout — the payload (human-readable text by default, a JSON envelope with --json)
//   stderr — diagnostics and error messages only
// Exit codes: 0 success · 1 usage or runtime error · 2 reserved for
// "ran, but found problems" (lands with the porcelain commands).

export function contentText(result) {
  return (result.content ?? [])
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');
}

// Tool payloads are strings; some tools emit JSON strings (wizards, some spec
// tools). Surface those as structured data in the envelope instead of a
// double-encoded string.
function parseMaybeJson(text) {
  const t = text.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return text;
  try {
    return JSON.parse(t);
  } catch {
    return text;
  }
}

export function printResult(result, { json = false, tool, code = null }) {
  const exitCode = code ?? (result.isError ? 1 : 0);
  const text = contentText(result);
  if (json) {
    const envelope = { ok: exitCode === 0, tool, exitCode };
    if (result.isError) envelope.error = text;
    else envelope.data = parseMaybeJson(text);
    // Some tools (lint) carry a structured mirror of their findings — pass it
    // through so machines don't have to parse the human text.
    if (result.structuredContent) envelope.structured = result.structuredContent;
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  } else if (result.isError) {
    process.stderr.write(`dsds: ${text}\n`);
  } else {
    process.stdout.write(text + '\n');
  }
  return exitCode;
}
