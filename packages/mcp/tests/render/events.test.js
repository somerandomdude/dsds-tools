// The native event surface, rendered from the extractor's `events` block.
//
// This exists because the gap it closes was silent. The DSDS documents used
// to carry a hand-written events table; that table was removed once the
// extractor learned to derive events from @types/react, on the premise that
// the extractor now owned them. Nothing rendered the field, so for one
// release the event surface was visible to no reader at all — the props table
// showed three props and stopped, and `onChange` appeared nowhere.

import { describe, it, expect } from 'vitest';
import { renderEvents20 } from '../../src/spec/render-0.20.0.js';

const SELECT_EVENTS = {
  source: '@types/react@19.2.17',
  tag: 'select',
  element: 'HTMLSelectElement',
  nativeHandlerCount: 85,
  handlers: [
    {
      name: 'onChange',
      type: 'ChangeEventHandler<T, HTMLSelectElement>',
      signature: '(event: React.ChangeEvent<HTMLSelectElement>) => void',
      specialized: true,
    },
    {
      name: 'onFocus',
      type: 'FocusEventHandler<T>',
      signature: '(event: React.FocusEvent<HTMLSelectElement>) => void',
      specialized: false,
    },
  ],
};

describe('renderEvents20', () => {
  it('renders a handler table with its derived signature', () => {
    const out = renderEvents20(SELECT_EVENTS).join('\n');
    expect(out).toContain('### Events');
    expect(out).toContain('`onChange`');
    expect(out).toContain('(event: React.ChangeEvent<HTMLSelectElement>) => void');
  });

  it('marks element-specialized handlers apart from inherited ones', () => {
    const lines = renderEvents20(SELECT_EVENTS);
    const onChange = lines.find((l) => l.includes('`onChange`'));
    const onFocus = lines.find((l) => l.includes('`onFocus`'));
    expect(onChange).toMatch(/\|\s*yes\s*\|?\s*$/);
    expect(onFocus).toMatch(/\|\s*no\s*\|?\s*$/);
  });

  it('states how many handlers the table leaves out', () => {
    // 85 declared, 2 shown. "Not listed" must never read as "not accepted".
    expect(renderEvents20(SELECT_EVENTS).join('\n')).toContain('83 further React handlers');
  });

  it('omits the count line when the table is complete', () => {
    const complete = { ...SELECT_EVENTS, nativeHandlerCount: 2 };
    expect(renderEvents20(complete).join('\n')).not.toContain('further React handlers');
  });

  it('renders nothing for a component with no event data', () => {
    expect(renderEvents20(null)).toEqual([]);
    expect(renderEvents20({ tag: 'div', handlers: [] })).toEqual([]);
  });

  it('renders a clickable element that specializes nothing', () => {
    // React declares onClick once, on DOMAttributes, so <button> narrows no
    // handler at all. Gating on `specialized` alone hid Button, IconButton,
    // PressArea, ListButtonItem, Link and SkipToContent.
    const button = {
      source: '@types/react@19.2.17',
      tag: 'button',
      nativeHandlerCount: 85,
      handlers: [
        { name: 'onClick', signature: '(event: React.MouseEvent<HTMLButtonElement>) => void', specialized: false },
      ],
    };
    const out = renderEvents20(button).join('\n');
    expect(out).toContain('### Events');
    expect(out).toContain('`onClick`');
  });

  it('flags the default element on a polymorphic component', () => {
    const button = {
      source: '@types/react@19.2.17',
      tag: 'button',
      nativeHandlerCount: 85,
      handlers: [
        { name: 'onClick', signature: '(event: React.MouseEvent<HTMLButtonElement>) => void', specialized: false },
      ],
    };
    const out = renderEvents20(button, 'markdown', { prop: 'as', defaultTag: 'button' }).join('\n');
    expect(out).toContain('`<button>` is the default element');
    expect(out).toContain('`as` changes it');
  });

  it('renders nothing when every handler is universally inherited', () => {
    // Divider is an <hr>. A documented onClick on it is the antipattern the
    // no-onclick-on-non-interactive rule exists to catch.
    const divider = {
      source: '@types/react@19.2.17',
      tag: 'hr',
      nativeHandlerCount: 85,
      handlers: [
        { name: 'onClick', signature: '(event: React.MouseEvent<HTMLHRElement>) => void', specialized: false },
        { name: 'onFocus', signature: '(event: React.FocusEvent<HTMLHRElement>) => void', specialized: false },
      ],
    };
    expect(renderEvents20(divider)).toEqual([]);
  });

  it('encodes the same columns in TOON as in Markdown', () => {
    const out = renderEvents20(SELECT_EVENTS, 'toon').join('\n');
    expect(out).toContain('events[2]{event,signature,elementSpecific}:');
  });
});
