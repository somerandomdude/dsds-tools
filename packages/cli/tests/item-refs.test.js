// `dsds doctor` must fail on an item-level `entryId#itemId` ref that does not
// resolve (DSDS-05). The relationship-graph check only sees entry-level
// refs, so item refs — where every `same-as` lives — went unchecked.
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadSystems } from 'dsds-mcp/src/loader.js';
import { checkItemRefs } from '../src/doctor.js';

const INDEX = fileURLToPath(new URL('../../mcp/fixtures/same-as-pool/index.dsds.yaml', import.meta.url));

describe('checkItemRefs', () => {
  it('reports exactly the ref whose item does not exist', async () => {
    const { systems } = await loadSystems([INDEX]);
    const problems = checkItemRefs(systems.flatMap((s) => s.entities));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('pool-pattern#does-not-exist');
    expect(problems[0]).toContain('has no item "does-not-exist"');
  });

  it('reports a ref to an entry that does not exist', () => {
    const entity = {
      id: 'solo',
      __sharedEntries: [],
      sections: [{ kind: 'guidelines', items: [{ refs: [{ to: 'ghost#rule', rel: 'same-as' }] }] }],
    };
    expect(checkItemRefs([entity])).toEqual([expect.stringContaining('no entry "ghost"')]);
  });

  it('flags a same-as with no #itemId to borrow from', () => {
    const entity = {
      id: 'solo',
      __sharedEntries: [],
      sections: [{ kind: 'guidelines', items: [{ refs: [{ to: 'somewhere', rel: 'same-as' }] }] }],
    };
    expect(checkItemRefs([entity])).toEqual([expect.stringContaining('has no #itemId')]);
  });

  it('passes a corpus where every ref resolves', () => {
    const target = { id: 'target', sections: [{ kind: 'guidelines', items: [{ id: 'rule', statement: 'x' }] }] };
    const user = {
      id: 'user',
      __sharedEntries: [target],
      sections: [{ kind: 'guidelines', items: [{ refs: [{ to: 'target#rule', rel: 'same-as' }] }] }],
    };
    expect(checkItemRefs([target, user])).toEqual([]);
  });
});
