/**
 * Live integration test: exercises the MCP server via the real SDK client.
 * Run: node scripts/test-live.js
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FIXTURES = resolve(ROOT, 'fixtures');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function makeClient(env = {}) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [resolve(ROOT, 'src/index.js')],
    env: { ...process.env, ...env },
  });
  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(transport);
  return client;
}

async function callTool(client, name, args = {}) {
  return client.callTool({ name, arguments: args });
}

// ─── Section 1: No DSDS_PATHS ──────────────────────────────────────────────
async function testUnconfigured() {
  console.log('\n── Unconfigured server (no DSDS_PATHS) ──');
  const client = await makeClient();

  // tools/list
  const { tools } = await client.listTools();
  check('lists 11 tools', tools.length === 11, `got ${tools.length}`);

  const toolNames = tools.map(t => t.name);
  for (const name of [
    'dsds_spec_overview', 'dsds_spec_entity_schema', 'dsds_spec_document_blocks',
    'dsds_spec_scaffold', 'dsds_validate', 'dsds_context_brief',
    'dsds_list_entities', 'dsds_get_entity', 'dsds_search_entities',
    'dsds_get_document_block', 'dsds_get_agent_context',
  ]) {
    check(`tool ${name} registered`, toolNames.includes(name));
  }

  // prompts/list
  const { prompts } = await client.listPrompts();
  check('lists 2 prompts', prompts.length === 2, `got ${prompts.length}`);
  const promptNames = prompts.map(p => p.name);
  check('build-with-design-system prompt exists', promptNames.includes('build-with-design-system'));
  check('author-dsds-docs prompt exists', promptNames.includes('author-dsds-docs'));

  // resources/list
  const { resources } = await client.listResources();
  check('no resources when unconfigured', resources.length === 0, `got ${resources.length}`);

  // dsds_spec_overview
  const overview = await callTool(client, 'dsds_spec_overview');
  check('spec overview has content', overview.content?.length > 0);
  check('spec overview not error', !overview.isError);
  const overviewText = overview.content[0].text;
  check('spec overview mentions DSDS', overviewText.includes('DSDS'));
  check('spec overview mentions entity kinds', overviewText.includes('component'));

  // dsds_spec_entity_schema — valid kind
  const schema = await callTool(client, 'dsds_spec_entity_schema', { kind: 'component' });
  check('entity schema not error', !schema.isError);
  check('entity schema has identifier field', schema.content[0].text.includes('identifier'));

  // dsds_spec_entity_schema — invalid kind
  const badSchema = await callTool(client, 'dsds_spec_entity_schema', { kind: 'foobar' });
  check('invalid kind returns isError', badSchema.isError === true);

  // dsds_spec_document_blocks — valid kind
  const blocks = await callTool(client, 'dsds_spec_document_blocks', { kind: 'token' });
  check('document blocks not error', !blocks.isError);
  check('document blocks has content', blocks.content[0].text.length > 0);

  // dsds_spec_scaffold — component (returns markdown with JSON code block; JSON is a full doc with entity wrapper)
  const scaffold = await callTool(client, 'dsds_spec_scaffold', { kind: 'component' });
  check('scaffold not error', !scaffold.isError);
  const scaffoldText = scaffold.content[0].text;
  const jsonMatch = scaffoldText.match(/```json\n([\s\S]+?)\n```/);
  check('scaffold contains JSON code block', jsonMatch !== null);
  const scaffoldJson = jsonMatch ? JSON.parse(jsonMatch[1]) : null;
  check('scaffold entity has kind field', scaffoldJson?.entity?.kind === 'component');
  check('scaffold entity has identifier field', typeof scaffoldJson?.entity?.identifier === 'string');

  // dsds_validate — valid document (full doc structure with entity wrapper)
  const validDoc = JSON.stringify({
    $schema: 'https://designsystemdocspec.org/v0.2.1/dsds.bundled.schema.json',
    dsdsVersion: '0.2.1',
    entity: { kind: 'component', identifier: 'btn', name: 'Button', documentBlocks: [] },
  });
  const valid = await callTool(client, 'dsds_validate', { document: validDoc });
  check('valid doc passes validation', !valid.isError);
  check('valid doc says valid', valid.content[0].text.toLowerCase().includes('valid'));

  // dsds_validate — invalid JSON
  const badJson = await callTool(client, 'dsds_validate', { document: '{ not valid json' });
  check('bad JSON returns isError', badJson.isError === true);
  check('bad JSON mentions parse error', badJson.content[0].text.toLowerCase().includes('parse'));

  // dsds_validate — schema error (missing required fields)
  const schemaBad = await callTool(client, 'dsds_validate', { document: JSON.stringify({ kind: 'component' }) });
  check('schema error says invalid', schemaBad.content[0].text.toLowerCase().includes('invalid') || schemaBad.content[0].text.toLowerCase().includes('error'));

  // dsds_context_brief — build
  const buildBrief = await callTool(client, 'dsds_context_brief', { useCase: 'build' });
  check('build brief not error', !buildBrief.isError);
  check('build brief has content', buildBrief.content[0].text.length > 100);

  // dsds_context_brief — author
  const authorBrief = await callTool(client, 'dsds_context_brief', { useCase: 'author' });
  check('author brief not error', !authorBrief.isError);
  check('author brief differs from build brief', authorBrief.content[0].text !== buildBrief.content[0].text);

  // dsds_context_brief — invalid useCase
  const badBrief = await callTool(client, 'dsds_context_brief', { useCase: 'unknown' });
  check('invalid useCase returns isError', badBrief.isError === true);

  // dsds_list_entities — unconfigured
  const listUnconfigured = await callTool(client, 'dsds_list_entities');
  check('list entities isError when unconfigured', listUnconfigured.isError === true);
  check('list entities mentions DSDS_PATHS', listUnconfigured.content[0].text.includes('DSDS_PATHS'));

  // dsds_get_entity — unconfigured
  const getUnconfigured = await callTool(client, 'dsds_get_entity', { identifier: 'button' });
  check('get entity isError when unconfigured', getUnconfigured.isError === true);

  // dsds_search_entities — unconfigured
  const searchUnconfigured = await callTool(client, 'dsds_search_entities', { query: 'button' });
  check('search entities isError when unconfigured', searchUnconfigured.isError === true);

  // prompts/get — build
  const buildPrompt = await client.getPrompt({ name: 'build-with-design-system', arguments: {} });
  check('build prompt returns messages', buildPrompt.messages?.length > 0);
  check('build prompt has user message', buildPrompt.messages[0].role === 'user');

  // prompts/get — author
  const authorPrompt = await client.getPrompt({ name: 'author-dsds-docs', arguments: {} });
  check('author prompt returns messages', authorPrompt.messages?.length > 0);

  await client.close();
}

// ─── Section 2: With DSDS_PATHS ────────────────────────────────────────────
async function testConfigured() {
  console.log('\n── Configured server (DSDS_PATHS → fixtures) ──');

  // Use manifest to exercise $ref resolution
  const env = {
    DSDS_PATHS: [
      `${FIXTURES}/manifest.dsds.json`,
      `${FIXTURES}/tokens.dsds.json`,
    ].join(','),
  };

  const client = await makeClient(env);

  // resources/list — should have entities
  const { resources } = await client.listResources();
  check('resources listed when configured', resources.length > 0, `got ${resources.length}`);
  check('at least 4 resources (button + 3 tokens)', resources.length >= 4, `got ${resources.length}`);
  const uris = resources.map(r => r.uri);
  check('button resource exists', uris.some(u => u.includes('button')));

  // resources/read — button
  const buttonRes = await client.readResource({ uri: 'dsds://entity/button' });
  check('button resource readable', buttonRes.contents?.length > 0);
  const buttonEntity = JSON.parse(buttonRes.contents[0].text);
  check('button entity has correct identifier', buttonEntity.identifier === 'button');
  check('button entity has correct kind', buttonEntity.kind === 'component');

  // resources/read — unknown entity
  try {
    await client.readResource({ uri: 'dsds://entity/nonexistent' });
    check('unknown resource throws error', false, 'should have thrown');
  } catch {
    check('unknown resource throws error', true);
  }

  // dsds_list_entities
  const list = await callTool(client, 'dsds_list_entities');
  check('list entities not error', !list.isError);
  const listText = list.content[0].text;
  check('list includes button', listText.includes('button'));
  check('list includes color-text-primary', listText.includes('color-text-primary'));

  // dsds_get_entity — button (returns formatted markdown, not raw JSON)
  const getButton = await callTool(client, 'dsds_get_entity', { identifier: 'button' });
  check('get button not error', !getButton.isError);
  const buttonText = getButton.content[0].text;
  check('get button mentions identifier', buttonText.includes('button'));
  check('get button mentions kind', buttonText.includes('component'));
  check('get button has document blocks or agents section', buttonText.includes('Documentation') || buttonText.includes('Agent Context'));

  // dsds_get_entity — not found
  const notFound = await callTool(client, 'dsds_get_entity', { identifier: 'zzz-nonexistent' });
  check('get nonexistent returns isError', notFound.isError === true);
  check('get nonexistent mentions identifier', notFound.content[0].text.includes('zzz-nonexistent'));

  // dsds_search_entities — by kind
  const searchKind = await callTool(client, 'dsds_search_entities', { kind: 'component' });
  check('search by kind not error', !searchKind.isError);
  check('search by kind finds button', searchKind.content[0].text.includes('button'));

  // dsds_search_entities — by query text
  const searchQuery = await callTool(client, 'dsds_search_entities', { query: 'color' });
  check('search by query finds color tokens', searchQuery.content[0].text.includes('color'));

  // dsds_search_entities — by status
  const searchDeprecated = await callTool(client, 'dsds_search_entities', { status: 'deprecated' });
  check('search by deprecated status works', !searchDeprecated.isError);

  // dsds_get_document_block — button (button has: purpose, api, accessibility)
  const docBlock = await callTool(client, 'dsds_get_document_block', {
    identifier: 'button',
    blockType: 'purpose',
  });
  check('get document block not error', !docBlock.isError);
  check('get document block has content', docBlock.content[0].text.length > 0);

  // dsds_get_document_block — block not present on entity
  const missingBlock = await callTool(client, 'dsds_get_document_block', {
    identifier: 'button',
    blockType: 'usage',
  });
  // Should return isError or a "not found" message — either is acceptable
  check('missing block handled gracefully', missingBlock.content?.length > 0);

  // dsds_get_agent_context — button (has agents field)
  const agentCtx = await callTool(client, 'dsds_get_agent_context', { identifier: 'button' });
  check('get agent context not error', !agentCtx.isError);
  const agentText = agentCtx.content[0].text;
  check('agent context mentions constraints', agentText.toLowerCase().includes('constraint'));
  check('agent context has MUST level', agentText.includes('MUST'));

  // dsds_get_agent_context — token (no agents field)
  const noAgentCtx = await callTool(client, 'dsds_get_agent_context', { identifier: 'color-text-primary' });
  check('get agent context no-agents not error', !noAgentCtx.isError);
  check('no-agents message shown', noAgentCtx.content[0].text.includes('no agent context'));

  // dsds_get_agent_context — not found
  const agentNotFound = await callTool(client, 'dsds_get_agent_context', { identifier: 'nonexistent' });
  check('agent context for unknown entity isError', agentNotFound.isError === true);

  // dsds_context_brief — with configured server shows entity count
  const brief = await callTool(client, 'dsds_context_brief', { useCase: 'build' });
  check('context brief with systems shows entity info', brief.content[0].text.includes('button') || brief.content[0].text.match(/\d+ entit/));

  await client.close();
}

// ─── Run ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('DSDS MCP Server — Live Integration Test');
  console.log('========================================');
  try {
    await testUnconfigured();
    await testConfigured();
  } catch (err) {
    console.error('\nFatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
