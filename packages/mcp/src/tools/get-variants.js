// A component's variants — the closed value sets a caller configures.
//
// This is a 0.21.0 tool. Before it, `traits` merged two different things
// behind one field and nothing told them apart: `kind` is `boolean`/`enum`,
// the *form* a value takes, and a boolean trait can be either sort —
// `outlined` is a variant, `hover` a state. So "what can I set on this
// component?" had no answer a tool could compute, and every route to the
// information returned both sorts mixed together. `traitType` makes the split
// declared, and this asks the question directly.
//
// Why it is worth its own tool rather than a filter on `dsds_get_entity`:
// measured across 49,222 logged calls, the invented-value failures agents
// actually make are variant-value failures — `Badge.tone="default"`,
// `Button.tone="primary"`, `Button.tone="positive"` — and the existing route
// to that answer is a whole entity render, where the closed sets sit below
// several thousand characters of guidance. Cheapest correct answer wins.
//
// States are counted but not listed by default. An agent writing JSX needs
// the values it may pass; `hover` and `focused` are conditions it cannot set,
// and including them is what made the old flat list hard to act on. Ask for
// them with include:"states" or include:"all".

import { getUpdateNotice } from '../spec/version.js';
import { notFoundMessage, didYouMean } from '../suggest.js';
import { renderTable } from '../render/table.js';
import { ERROR_CODES, describeSuggestions, toolError } from '../errors.js';
import { noDocumentsConfiguredBrief } from '../setup-guidance.js';

const INCLUDE = ['variants', 'states', 'all'];

export const getVariantsDef = {
  name: 'dsds_get_variants',
  description:
    'List a component\'s variants — every configurable dimension and its allowed values, from the component\'s `traits`. ' +
    'USE THIS WHEN you are about to set a prop like tone, size, level or density and need the exact permitted values: it is the closed set, so anything outside it is invalid. ' +
    'Returns variants only by default (what you can set); pass include:"states" for runtime conditions like hover or loading, or include:"all" for both. ' +
    'Pairing rules between traits (`combos`) are included when the document declares any. For the full documentation of a component use dsds_get_agent_context.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'The component identifier (e.g. "button").',
      },
      include: {
        type: 'string',
        enum: INCLUDE,
        description:
          'Which traits to list. "variants" (default) is what a caller configures; "states" is what the component can be in; "all" is both, labelled.',
      },
    },
    required: ['identifier'],
  },
};

/**
 * One trait as a table row. A boolean has no value list — saying so beats an
 * empty cell, which reads as missing data rather than as "it is a toggle".
 */
function toRow(trait, { labelled }) {
  const values =
    trait.kind === 'enum'
      ? (trait.values ?? []).map(v => `\`${v.id ?? v}\``).join(' | ') || '—'
      : '`true` | `false`';
  return {
    trait: `\`${trait.id}\``,
    ...(labelled ? { type: trait.traitType ?? '—' } : {}),
    values,
    setBy: trait.setBy ?? '—',
    description: trait.description ?? '',
  };
}

const COLUMNS = (labelled) => [
  { key: 'trait', header: 'Trait' },
  ...(labelled ? [{ key: 'type', header: 'Type' }] : []),
  { key: 'values', header: 'Values' },
  { key: 'setBy', header: 'Set by' },
  { key: 'description', header: 'Description' },
];

/**
 * A trait with no `traitType`.
 *
 * `traitType` is required, so this looks unreachable — and it isn't, because
 * required is a *validation* property, not a loading one. `dsds_validate`
 * rejects such a document; the loader every read tool uses does not, and it
 * shouldn't: a tool that refused to show an invalid document would be useless
 * in the loop that fixes it.
 *
 * So the case is whatever a 0.20.x corpus looks like when this server serves
 * it. At the time of writing that is the majority of traits on this machine —
 * 192 of 308, one un-migrated copy of a corpus — which is exactly the
 * situation in which someone reaches for a tool to ask what the variants are.
 *
 * Counted as neither sort rather than guessed into one: a silent omission
 * here is indistinguishable from a component that genuinely has no variants.
 */
const isVariant = (t) => t?.traitType === 'variant';
const isState = (t) => t?.traitType === 'state';
const isUnclassified = (t) => !isVariant(t) && !isState(t);

export async function getVariantsHandler(
  { identifier, include },
  getSystems,
  format = 'markdown',
) {
  const mode = INCLUDE.includes(include) ? include : 'variants';
  const systems = getSystems?.() ?? [];

  if (systems.length === 0) {
    return toolError({
      code: ERROR_CODES.NOT_CONFIGURED,
      text: noDocumentsConfiguredBrief(),
      message: 'No DSDS files configured.',
    });
  }

  const needle = String(identifier ?? '').toLowerCase();
  let found = null;
  const candidates = [];
  for (const system of systems) {
    for (const entity of system.entities ?? []) {
      if (entity.identifier) candidates.push(entity.identifier);
      if (
        !found &&
        (entity.identifier?.toLowerCase() === needle || entity.name?.toLowerCase() === needle)
      ) {
        found = entity;
      }
    }
  }

  if (!found) {
    const matches = didYouMean(identifier, candidates);
    return toolError({
      code: ERROR_CODES.UNKNOWN_ENTITY,
      text: notFoundMessage({
        label: 'Component',
        input: identifier,
        candidates,
        listHint: '`dsds_list_entities`',
      }),
      message: `Component "${identifier}" not found.`,
      suggestions: describeSuggestions(identifier, matches),
      details: { input: identifier },
    });
  }

  const traits = Array.isArray(found.traits) ? found.traits : [];
  const variants = traits.filter(isVariant);
  const states = traits.filter(isState);
  const unclassified = traits.filter(isUnclassified);

  const lines = [`# Variants of \`${found.identifier}\``, ''];

  if (traits.length === 0) {
    // Not an error: plenty of components genuinely have no variants, and the
    // answer "none declared" is the answer. Naming where the props live keeps
    // the caller from reading this as "it takes no props at all" — `traits`
    // documents variation, not the whole API surface.
    lines.push(
      `\`${found.identifier}\` declares no traits, so it has no documented variants or states.`,
      '',
      'That is not the same as taking no props: a component\'s API surface comes from its `sourceFiles`, which a props extractor reads. `traits` documents the axes of variation a designer chose to name.',
    );
    return { content: [{ type: 'text', text: lines.join('\n') + (getUpdateNotice() ?? '') }] };
  }

  const sections = [];
  if (mode === 'variants') sections.push(['Variants', variants]);
  else if (mode === 'states') sections.push(['States', states]);
  else sections.push(['Variants', variants], ['States', states]);
  if (unclassified.length) sections.push(['Unclassified', unclassified]);

  const labelled = mode === 'all';
  for (const [label, list] of sections) {
    if (sections.length > 1) lines.push(`## ${label}`, '');
    if (list.length === 0) {
      lines.push(`None declared.`, '');
      continue;
    }
    lines.push(
      renderTable(list.map(t => toRow(t, { labelled })), COLUMNS(labelled), {
        format,
        name: label.toLowerCase(),
      }),
      '',
    );
  }

  // Pairing rules are the other half of "what may I set" — a value that is
  // valid alone can be forbidden next to another. Filtered to the traits on
  // screen so a states-only call doesn't carry variant combos.
  const shown = new Set(sections.flatMap(([, list]) => list).map(t => t.id));
  const combos = (Array.isArray(found.combos) ? found.combos : []).filter(
    c => shown.has(c.subject) || (c.items ?? []).some(i => shown.has(String(i).split('.')[0])),
  );
  if (combos.length) {
    lines.push('## Pairing rules', '');
    for (const combo of combos) {
      const items = (combo.items ?? []).map(i => `\`${i}\``).join(', ');
      lines.push(`- **${combo.level}** — \`${combo.subject}\` with ${items}`);
      if (combo.note) lines.push(`  - ${combo.note}`);
    }
    lines.push('');
  }

  // What was left out, and how to ask for it. Stated as a count so the caller
  // can decide whether a second call is worth it.
  if (mode === 'variants' && states.length) {
    lines.push(
      `${states.length} state${states.length !== 1 ? 's' : ''} not shown (conditions the component is in, not values you set). Call with include:"states" for them.`,
    );
  } else if (mode === 'states' && variants.length) {
    lines.push(
      `${variants.length} variant${variants.length !== 1 ? 's' : ''} not shown. Call with include:"variants" for them.`,
    );
  }
  if (unclassified.length) {
    lines.push(
      '',
      `${unclassified.length} trait${unclassified.length !== 1 ? 's' : ''} carry no \`traitType\`, so neither list claims them. \`traitType\` is required as of spec 0.21.0 — this document predates it, and nothing on the read path enforces a required field. Run dsds_validate on it to see every trait affected.`,
    );
  }

  return {
    content: [{ type: 'text', text: lines.join('\n').trimEnd() + (getUpdateNotice() ?? '') }],
    structuredContent: {
      identifier: found.identifier,
      counts: { variants: variants.length, states: states.length, unclassified: unclassified.length },
    },
  };
}
