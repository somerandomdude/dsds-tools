import { writeLog } from '../logger.js';

export const getChunkDef = {
  name: 'dsds_get_chunk',
  description:
    'Get a chunk by identifier, rendered for agent use. Returns the code block (ready to copy), ' +
    'guidelines, use cases, and its relationships (composes / depends-on / alternative-to edges). ' +
    'Use this instead of dsds_get_entity when working with chunk entities.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: {
        type: 'string',
        description: 'Chunk identifier (case-insensitive, kebab-case).',
      },
    },
    required: ['identifier'],
  },
};

export async function getChunkHandler({ identifier }, getSystems, logsDir = null) {
  const systems = getSystems();

  if (!systems || systems.length === 0) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: 'No DSDS systems loaded. Set the DSDS_PATHS environment variable to point at your .dsds.json file(s).',
      }],
    };
  }

  const needle = identifier.toLowerCase();
  let chunk = null;

  for (const system of systems) {
    for (const entity of system.entities) {
      if ((entity.kind === 'chunk' || entity.kind === 'blueprint') && entity.identifier?.toLowerCase() === needle) {
        chunk = entity;
        break;
      }
    }
    if (chunk) break;
  }

  if (!chunk) {
    const allChunks = systems
      .flatMap(s => s.entities)
      .filter(e => e.kind === 'chunk' || e.kind === 'blueprint')
      .map(e => e.identifier);

    const hint = allChunks.length > 0
      ? `\n\nAvailable chunks: ${allChunks.map(id => `\`${id}\``).join(', ')}`
      : '\n\nNo chunks found in the loaded design system.';

    return {
      isError: true,
      content: [{ type: 'text', text: `Chunk \`${identifier}\` not found.${hint}` }],
    };
  }

  const lines = [
    `# Chunk: ${chunk.name}`,
    `\`${chunk.identifier}\``,
    '',
  ];

  if (chunk.description) {
    lines.push(chunk.description, '');
  }

  const meta = chunk.metadata;
  if (meta) {
    const status = resolveStatus(meta);
    if (status) lines.push(`**Status:** ${status}`, '');
  }

  // Code block — the primary payload
  const { code: codeStr, language } = chunk.code ?? {};
  lines.push(
    '## Code',
    '',
    `\`\`\`${language ?? ''}`,
    codeStr ?? '',
    '```',
    '',
  );

  const relationships = resolveRelationships(chunk);
  if (relationships.length > 0) {
    lines.push('## Relationships', '');
    for (const r of relationships) {
      const req = r.required ? ' *(required)*' : '';
      const role = r.role ? ` — ${r.role}` : '';
      lines.push(`- **${r.relation}** \`${r.target}\`${role}${req}`);
    }
    lines.push('');
  }

  const useCases = chunk.useCases ?? [];
  if (useCases.length > 0) {
    const recommended = useCases.filter(u => u.stance === 'recommended');
    const discouraged = useCases.filter(u => u.stance === 'discouraged');

    if (recommended.length > 0) {
      lines.push('## When to use', '');
      for (const u of recommended) lines.push(`- ${u.description}`);
      lines.push('');
    }
    if (discouraged.length > 0) {
      lines.push('## When not to use', '');
      for (const u of discouraged) {
        lines.push(`- ${u.description}`);
        if (u.alternative) {
          lines.push(`  *Alternative: \`${u.alternative.identifier}\` — ${u.alternative.rationale}*`);
        }
      }
      lines.push('');
    }
  }

  const guidelines = chunk.guidelines ?? [];
  if (guidelines.length > 0) {
    lines.push('## Guidelines', '');
    for (const g of guidelines) {
      const level = formatLevel(g.level);
      const rationale = g.rationale ? ` — ${g.rationale}` : '';
      lines.push(`- **${level}:** ${g.guidance}${rationale}`);
    }
    lines.push('');
  }

  await writeLog(logsDir, { type: 'chunk', tool: 'dsds_get_chunk', identifier: chunk.identifier, name: chunk.name });
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function resolveStatus(metadata) {
  if (!metadata) return undefined;
  if (Array.isArray(metadata)) {
    return metadata.find(m => m.kind === 'status')?.status;
  }
  const s = metadata.status;
  if (!s) return undefined;
  return typeof s === 'string' ? s : s.overall ?? s.value;
}

// DSDS 0.12.0: relationships are typed edges on entity.relationships.
// Falls back to the deprecated metadata.links (internal-artifact kinds) so
// un-migrated documents still render a Relationships section.
function resolveRelationships(entity) {
  if (Array.isArray(entity.relationships) && entity.relationships.length > 0) {
    return entity.relationships;
  }
  const meta = entity.metadata;
  const links = (meta && !Array.isArray(meta) ? meta.links : null) ?? [];
  const ARTIFACT_KINDS = ['component', 'pattern', 'foundation', 'token', 'token-group', 'chunk', 'required'];
  return links
    .filter(l => l.identifier && ARTIFACT_KINDS.includes(l.kind))
    .map(l => ({
      relation: l.kind === 'chunk' ? 'alternative-to' : 'composes',
      target: l.identifier,
      role: l.role,
      required: l.kind === 'required',
    }));
}

function formatLevel(level) {
  switch (level) {
    case 'must':       return 'Must';
    case 'must-not':   return 'Must not';
    case 'should':     return 'Should';
    case 'should-not': return 'Should not';
    default:           return level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Note';
  }
}
