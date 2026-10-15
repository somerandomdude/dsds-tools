// Rendering the core's MCP-canonical prose for a shell.

import { describe, it, expect } from 'vitest';
import { toCliVocabulary, CLI_EQUIVALENTS } from '../src/vocabulary.js';
import { MCP_GUIDANCE, MCP_BRIEF } from '../src/setup-guidance.js';
import { BUILD_BRIEF, AUTHOR_BRIEF, ASK_BRIEF } from '../src/briefs.js';
import { buildInstructions } from '../src/instructions.js';
import { createToolRuntime } from '../src/registry.js';
import { createGraphGetter } from '../src/graph.js';

// A tool name is "translated" if it maps to a porcelain command; the ones
// with no porcelain keep their name inside a `dsds tool …` invocation, which
// is the command that actually runs them.
const leftoverToolNames = text => text.match(/(?<!dsds tool )dsds_[a-z_]+/g) ?? [];

describe('toCliVocabulary — tool names', () => {
  it('maps a tool to its porcelain command', () => {
    expect(toCliVocabulary('See dsds_list_entities for the catalog.')).toBe(
      'See dsds list for the catalog.'
    );
  });

  it('turns "call" into "run" for a backticked command', () => {
    expect(toCliVocabulary('Call `dsds_list_entities` first.')).toBe('Run `dsds list` first.');
  });

  it('rewrites a call expression into a runnable command', () => {
    expect(toCliVocabulary('dsds_get_agent_context(identifier)')).toBe('dsds context <identifier>');
  });

  it('reorders the two-argument document-block call', () => {
    expect(toCliVocabulary('dsds_get_document_block(identifier, "api")')).toBe('dsds get <identifier> --block api');
  });

  it('gives a porcelain-less tool its dsds tool invocation with flags', () => {
    expect(toCliVocabulary('dsds_explain_error(error)')).toBe(
      'dsds tool dsds_explain_error --error "<error>"'
    );
  });

  it('leaves an unmapped tool name alone rather than mistranslating it', () => {
    expect(toCliVocabulary('dsds_not_a_real_tool')).toBe('dsds_not_a_real_tool');
  });

  it('leaves prose in parentheses alone', () => {
    const prose = 'dsds_impact(this is a long sentence that is clearly not an argument list at all)';
    expect(toCliVocabulary(prose)).toContain('(this is a long sentence');
  });

  it('covers every registered tool', () => {
    const { toolDefs } = createToolRuntime({
      getSystems: () => [],
      getSummaries: () => [],
      getGraph: createGraphGetter(() => []),
    });
    for (const def of toolDefs) {
      expect(CLI_EQUIVALENTS[def.name], `${def.name} has no CLI equivalent`).toBeDefined();
    }
  });
});

describe('toCliVocabulary — phrasing', () => {
  it('stops telling a shell user they are talking to an MCP server', () => {
    expect(toCliVocabulary('Each step uses a tool from this MCP server — call them in order.')).toBe(
      'Each step is a dsds command — run them in order.'
    );
  });

  it('retitles the instruction block', () => {
    expect(toCliVocabulary('DSDS MCP — Design System Documentation Spec v0.20.0')).toBe(
      'DSDS CLI — Design System Documentation Spec v0.20.0'
    );
  });

  it('swaps the setup guidance for the one that names dsds init', () => {
    const out = toCliVocabulary(MCP_GUIDANCE);
    expect(out).toContain('dsds init');
    expect(out).not.toContain('MCP client config');
    // The MCP copy tells CLI users something untrue of a config file.
    expect(out).not.toContain('only absolute paths are supported');
  });

  it('swaps the one-line setup guidance too', () => {
    expect(toCliVocabulary(MCP_BRIEF)).toContain('dsds init');
  });

  it('is a no-op on empty or non-string input', () => {
    expect(toCliVocabulary('')).toBe('');
    expect(toCliVocabulary(null)).toBe(null);
  });
});

describe('the texts a CLI user actually reads', () => {
  it.each([
    ['build brief', BUILD_BRIEF],
    ['author brief', AUTHOR_BRIEF],
    ['ask brief', ASK_BRIEF],
    ['instructions', buildInstructions()],
  ])('%s names no tool a shell user cannot invoke', (_label, text) => {
    expect(leftoverToolNames(toCliVocabulary(text))).toEqual([]);
  });

  it('leaves the MCP rendering untouched', () => {
    // The core's canonical text is what MCP serves; translation is opt-in.
    expect(BUILD_BRIEF).toContain('dsds_list_entities');
    expect(buildInstructions()).toContain('DSDS MCP');
  });
});
