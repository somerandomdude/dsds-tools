import { getUpdateNotice } from '../spec/version.js';
import { noDocumentsConfiguredBrief } from '../setup-guidance.js';
import { notFoundMessage, entityIdentifiers, didYouMean } from '../suggest.js';
import { renderApi20 } from '../spec/render-0.20.0.js';

export const getDocumentBlockDef = {
  name: 'dsds_get_document_block',
  description:
    'Get a specific document block from an entity (e.g. just the "api" block from "button") without retrieving the full entity. Useful for targeted lookups when building with the design system.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The entity identifier or name.',
      },
      blockType: {
        type: 'string',
        description: 'The document block type to retrieve (e.g. "api", "accessibility", "anatomy", "variants").',
      },
    },
    required: ['identifier', 'blockType'],
  },
};

// Names agents ask for that are not typos of a real block, just a different
// word for it. Edit distance cannot bridge `props` -> `api`, so the mapping
// is stated. Each candidate is still checked against what the entity
// actually has, so a synonym never invents a block.
//
// Sourced from the 2026-09-11 ui5-cli runs, where `--block props`, `code`
// and `notes` each cost a turn. `content` is absent deliberately: it
// already resolves, case-insensitively, against a section titled "Content".
const BLOCK_SYNONYMS = {
  props: ['api'],
  properties: ['api'],
  propstable: ['api'],
  proptypes: ['api'],
  usage: ['guidelines', 'When to use'],
  a11y: ['accessibility', 'Accessibility'],
  accessibility: ['Accessibility'],
  keyboard: ['Keyboard interactions'],
  code: ['code', 'Code', 'section'],
  notes: ['notes', 'Notes', 'section'],
  examples: ['examples', 'Examples'],
};

// The top-level fields a block name can resolve to.
const TOP_LEVEL_FIELD_NAMES = ['traits', 'sourceFiles', 'combos', 'imports'];

/** Every block name that resolves on this entity, each listed once. */
function availableBlockNames(entity) {
  const unique = xs => [...new Set(xs.filter(Boolean))];
  if (entity.__dsds20) {
    return unique([
      'api',
      ...(entity.sections ?? []).map(b => b.kind),
      ...(entity.sections ?? []).map(b => b.title),
      ...TOP_LEVEL_FIELD_NAMES.filter(f => entity[f]?.length),
    ]);
  }
  return unique((entity.documentBlocks ?? []).map(b => b.kind));
}

/**
 * The real block name for what the caller asked for.
 *
 * Resolution order: exact, then synonym, then single-candidate typo. Every
 * candidate is checked against `availableBlockNames`, so this can rename a
 * request but never invent a block. Returns the original name unchanged
 * when nothing matches, leaving the caller's existing error path intact.
 */
function canonicalBlockName(entity, requested) {
  const available = availableBlockNames(entity);
  const hit = name => available.find(a => a.toLowerCase() === String(name).toLowerCase());
  const exact = hit(requested);
  if (exact) return { name: exact === requested ? requested : exact, coercedFrom: null };

  for (const candidate of BLOCK_SYNONYMS[String(requested).toLowerCase()] ?? []) {
    const found = hit(candidate);
    if (found) return { name: found, coercedFrom: requested };
  }
  const near = didYouMean(requested, available);
  if (near.length === 1) return { name: near[0], coercedFrom: requested };
  return { name: requested, coercedFrom: null };
}

export async function getDocumentBlockHandler({ identifier, blockType }, getSystems, propsConfig = null, format = 'markdown') {
  const systems = getSystems();
  if (systems.length === 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: noDocumentsConfiguredBrief() }],
    };
  }

  const needle = identifier.toLowerCase();
  let found = null;

  for (const system of systems) {
    const entity = system.entities.find(
      e => e.identifier?.toLowerCase() === needle || e.name?.toLowerCase() === needle
    );
    if (entity) { found = entity; break; }
  }

  if (!found) {
    return {
      isError: true,
      content: [{ type: 'text', text: notFoundMessage({
          label: 'Entity',
          input: identifier,
          candidates: entityIdentifiers(systems),
          listHint: '`dsds_list_entities`',
        }) }],
    };
  }

  // Normalised before anything dispatches on the name, so `--block props`
  // reaches the same `api` branch the HARD RULE points agents at.
  const { name: canonical, coercedFrom } = canonicalBlockName(found, blockType);
  blockType = canonical;

  if (found.__dsds20 && blockType === 'api') {
    // Real 0.20.0 has no `api`-kind section — the API comes from `sourceFiles`
    // resolved through the extractor cache (DEC-2). This is the call site the
    // server's HARD RULE points agents at ("at minimum
    // dsds_get_document_block(identifier, 'api')"), so it must render real
    // prop data, not the raw `sourceFiles` pointer a generic passthrough would.
    const lines = [`# ${found.name ?? found.identifier} — \`api\` block`,
      ...(coercedFrom ? [`> Read \`${coercedFrom}\` as \`api\`.`] : []), ''];
    renderApi20(found, lines, propsConfig, format);
    if (lines.length === 2) lines.push('*No API data available for this entry.*', '');
    const notice = getUpdateNotice();
    if (notice) lines.push(notice);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  let block;
  let available;
  if (found.__dsds20) {
    // Real 0.20.0: look up a section by kind (definitions/guidelines/steps/
    // section) or by its own title (0.20.0's generic sections are often
    // addressed by title rather than kind). traits/sourceFiles/combos/
    // imports are top-level entry fields, not sections — allow those names
    // too, since an agent has no other way to ask for just one of them.
    const TOP_LEVEL_FIELDS = ['traits', 'sourceFiles', 'combos', 'imports'];
    if (TOP_LEVEL_FIELDS.includes(blockType)) {
      block = found[blockType] ? { kind: blockType, items: found[blockType] } : null;
    } else {
      const blockNeedle = blockType.toLowerCase();
      block = found.sections?.find(b => b.kind === blockType) ??
        found.sections?.find(b => b.title?.toLowerCase() === blockNeedle);
    }
    // Every name that actually resolves, each listed once. This used to
    // print one entry per section — so a component with four `guidelines`
    // sections advertised `guidelines` four times — while omitting `api`,
    // which is handled above and is the name the instructions tell agents
    // to ask for.
    available = unique([
      'api',
      ...(found.sections ?? []).map(b => b.kind),
      ...(found.sections ?? []).map(b => b.title).filter(Boolean),
      ...TOP_LEVEL_FIELDS.filter(f => found[f]?.length),
    ]);
  } else {
    block = found.documentBlocks?.find(b => b.kind === blockType);
    available = unique((found.documentBlocks ?? []).map(b => b.kind));
  }

  if (!block) {
    if (available.length === 0) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Entity "${found.identifier}" has no sections or document blocks defined.` }],
      };
    }
    const suggestions = didYouMean(blockType, available);
    const lines = [`Entity "${found.identifier}" has no "${blockType}" section or block.`];
    if (suggestions.length > 0) {
      lines.push('', `Did you mean: ${suggestions.map(s => `\`${s}\``).join(', ')}?`);
    }
    lines.push('', `Available: ${available.map(a => `\`${a}\``).join(', ')}`);
    return { isError: true, content: [{ type: 'text', text: lines.join('\n') }] };
  }

  const lines = [
    `# ${found.name ?? found.identifier} — \`${blockType}\` block`,
    ...(coercedFrom ? ['', `> Read \`${coercedFrom}\` as \`${blockType}\`.`] : []),
    '',
    '```json',
    JSON.stringify(block, null, 2),
    '```',
  ];

  const notice = getUpdateNotice();
  if (notice) lines.push(notice);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
