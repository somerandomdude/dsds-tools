// Output contract:
//   stdout — the payload (human-readable text by default, a JSON envelope with --json)
//   stderr — diagnostics and error messages only
// Exit codes: 0 success · 1 usage or runtime error · 2 reserved for
// "ran, but found problems" (lands with the porcelain commands).
//
// Handler prose is written in the canonical (MCP) vocabulary, so everything
// printed here passes through toCliVocabulary first: a shell user reading
// "call dsds_list_entities" has been handed the name of something they
// cannot invoke.

import { toCliVocabulary } from 'dsds-mcp/src/vocabulary.js';

export function contentText(result) {
  return (result.content ?? [])
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');
}

// Absolute paths inside the working directory are noise in output that gets
// pasted into a PR or diffed in CI — and they leak the machine's layout.
function relativizePaths(text) {
  const cwd = process.cwd();
  if (!cwd || cwd === '/') return text;
  return text.split(`${cwd}/`).join('./');
}

// The one place handler text becomes user-facing text.
export function renderText(text) {
  return relativizePaths(toCliVocabulary(text));
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
  const text = renderText(contentText(result));

  if (json) {
    const envelope = { ok: exitCode === 0, tool, exitCode };
    if (result.isError) {
      envelope.error = text;
    } else if (result.structuredContent) {
      // A tool that knows its own shape wins: `data` is the data, and the
      // rendered prose stays available as `text`. Before this every read
      // command put a markdown document in `data`, so `--json` was only
      // machine-readable down to the envelope — `.data[].identifier` was
      // impossible and the advertised `| jq -r .data` just returned markdown.
      envelope.data = result.structuredContent;
      envelope.text = text;
    } else {
      envelope.data = parseMaybeJson(text);
    }
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  } else if (result.isError) {
    process.stderr.write(`dsds: ${text}\n`);
  } else {
    process.stdout.write(text + '\n');
  }
  return exitCode;
}
