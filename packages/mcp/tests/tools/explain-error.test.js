import { describe, it, expect } from 'vitest';
import { explainErrorHandler } from '../../src/tools/explain-error.js';

describe('explainErrorHandler', () => {
  it('returns a no-match message for empty input', () => {
    const result = explainErrorHandler({ error: '' });
    expect(result.content[0].text).toContain('No known generic pattern matched');
  });

  it('returns a no-match message for unrelated text', () => {
    const result = explainErrorHandler({ error: 'ENOENT: no such file or directory' });
    expect(result.content[0].text).toContain('No known generic pattern matched');
  });

  it('matches an invalid prop error', () => {
    const error =
      "Property 'gap' does not exist on type 'IntrinsicAttributes & BoxProps<\"div\">'.";
    const result = explainErrorHandler({ error });
    expect(result.content[0].text).toContain('`Box` has no `gap` prop');
  });

  it('matches a missing required prop error (TS2741)', () => {
    const error =
      "Property 'label' is missing in type '{ checked: boolean; onChange: (e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => void; }' but required in type 'SwitchProps'.";
    const result = explainErrorHandler({ error });
    expect(result.content[0].text).toContain('`Switch` requires a `label` prop');
  });

  it('matches multiple missing required props without duplicating', () => {
    const error = [
      "Property 'label' is missing in type '{ checked: boolean; }' but required in type 'SwitchProps'.",
      "Property 'label' is missing in type '{ id: string; }' but required in type 'CheckboxProps'.",
    ].join('\n');
    const result = explainErrorHandler({ error });
    expect(result.content[0].text).toContain('`Switch` requires a `label` prop');
    expect(result.content[0].text).toContain('`Checkbox` requires a `label` prop');
  });

  it('matches a boolean-given-a-string error', () => {
    const error = "Type 'string' is not assignable to type 'Responsive<boolean> | undefined'.";
    const result = explainErrorHandler({ error });
    expect(result.content[0].text).toContain('A boolean prop was given a string');
  });

  it('matches a number-given-where-CSS-string-expected error', () => {
    const error = "Type 'number' is not assignable to type 'Responsive<string> | undefined'.";
    const result = explainErrorHandler({ error });
    expect(result.content[0].text).toContain('sizing/grid prop');
  });

  it('matches an implicit-any parameter error', () => {
    const error = "Parameter 'e' implicitly has an 'any' type.";
    const result = explainErrorHandler({ error });
    expect(result.content[0].text).toContain('Add a type to `e`');
  });

  it('matches a tsconfig-edit warning', () => {
    const error = "tsconfig.json(4,5): error TS5023: Unknown compiler option 'foo'.";
    const result = explainErrorHandler({ error });
    expect(result.content[0].text).toContain('Do not modify tsconfig.json');
  });

  it('de-duplicates repeated identical hints', () => {
    const error = [
      "tsconfig.json(4,5): error TS5023: Unknown compiler option 'foo'.",
      "tsconfig.json(4,5): error TS5023: Unknown compiler option 'foo'.",
    ].join('\n');
    const result = explainErrorHandler({ error });
    const matches = result.content[0].text.match(/Do not modify tsconfig\.json/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('matches several distinct patterns in one combined error blob', () => {
    const error = [
      "Property 'label' is missing in type '{ checked: boolean; }' but required in type 'SwitchProps'.",
      "Parameter 'e' implicitly has an 'any' type.",
    ].join('\n');
    const result = explainErrorHandler({ error });
    expect(result.content[0].text).toContain('`Switch` requires a `label` prop');
    expect(result.content[0].text).toContain('Add a type to `e`');
  });

  it('never errors, even on garbage input', () => {
    const result = explainErrorHandler({ error: '☃️💥 not an error at all\n\n\n' });
    expect(result.isError).toBeFalsy();
  });
});
