import { describe, expect, it, vi } from 'vitest';

// renderApi20 reads the extractor through getApiForEntry; stub it so these
// tests describe rendering behaviour only, with no clone or cache involved.
vi.mock('../../src/spec/prop-extractor-0.20.0.js', () => ({
  getApiForEntry: vi.fn(),
}));

const { getApiForEntry } = await import('../../src/spec/prop-extractor-0.20.0.js');
const { renderApi20 } = await import('../../src/spec/render-0.20.0.js');

const render = (result) => {
  getApiForEntry.mockReturnValue(result);
  const lines = [];
  renderApi20({ id: 'x', name: 'X', sourceFiles: [{ platform: 'react', file: 'X.tsx' }] }, lines, {});
  return lines.join('\n');
};

const PROP = { name: 'as', type: 'T', required: false, description: 'HTML element to render.' };

describe('renderApi20 — a component with no props of its own', () => {
  // Regression: List.ItemImage forwards everything to a native <img>, so the
  // extractor succeeds and returns zero own props. renderApi20 used to return
  // silently, leaving the caller to print "No API data available for this
  // entry" — the wording it uses when extraction actually failed. A real
  // answer was being served as a documentation gap.
  it('says so explicitly instead of rendering nothing', () => {
    const out = render({ status: 'fresh', props: { props: [], alsoAccepts: ['native <img> attributes'] } });
    expect(out).toContain('## API');
    expect(out).toContain('This component has no props of its own.');
    expect(out).not.toContain('No API data available');
  });

  it('names the native element it forwards to', () => {
    const out = render({ status: 'fresh', props: { props: [], alsoAccepts: ['native <img> attributes'] } });
    expect(out).toContain('Also accepts native `<img>` attributes.');
  });

  it('still renders nothing when there is genuinely nothing to say', () => {
    // No own props and no forwarding target — the caller's "no API data"
    // fallback is the right answer here, so stay out of its way.
    expect(render({ status: 'fresh', props: { props: [], alsoAccepts: [] } })).toBe('');
  });
});

describe('renderApi20 — alsoAccepts wording', () => {
  // The extractor emits a whole phrase ("native <dialog> attributes"), so the
  // old template produced "accepts native attributes from `native <dialog>
  // attributes`". Backtick the tag, not the sentence.
  it('reads as a sentence and does not double the words', () => {
    const out = render({ status: 'fresh', props: { props: [PROP], alsoAccepts: ['native <dialog> attributes'] } });
    expect(out).toContain('*Also accepts native `<dialog>` attributes.*');
    expect(out).not.toContain('native attributes from');
  });

  it('keeps the tag in code formatting so markdown cannot eat it', () => {
    const out = render({ status: 'fresh', props: { props: [PROP], alsoAccepts: ['native <img> attributes'] } });
    expect(out).toContain('`<img>`');
  });
});

describe('renderApi20 — unchanged paths', () => {
  it('renders the table when props exist', () => {
    const out = render({ status: 'fresh', props: { props: [PROP], alsoAccepts: [] } });
    expect(out).toContain('| Prop | Type | Required | Description |');
    expect(out).toContain('`as`');
    expect(out).not.toContain('no props of its own');
  });

  it('keeps the unverified freshness warning', () => {
    const out = render({ status: 'unverified', props: { props: [PROP], alsoAccepts: [] } });
    expect(out).toContain('Freshness not verified against source');
  });

  it('renders nothing for a component with no sourceFiles', () => {
    expect(render({ status: 'no-source' })).toBe('');
  });
});

describe('renderApi20 — alsoAccepts, the type-name shape', () => {
  // The extractor also emits a bare type ("React.ComponentProps<'div'>"),
  // which needs the original framing rather than the phrase sentence.
  it('keeps "native attributes from" for a type name', () => {
    const out = render({ status: 'fresh', props: { props: [PROP], alsoAccepts: ["React.ComponentProps<'div'>"] } });
    expect(out).toContain("*Also accepts native attributes from `React.ComponentProps<'div'>`.*");
  });

  it('gives each shape its own sentence when both are present', () => {
    const out = render({
      status: 'fresh',
      props: { props: [PROP], alsoAccepts: ['native <img> attributes', "React.ComponentProps<'div'>"] },
    });
    expect(out).toContain('*Also accepts native `<img>` attributes.*');
    expect(out).toContain("*Also accepts native attributes from `React.ComponentProps<'div'>`.*");
  });
});
