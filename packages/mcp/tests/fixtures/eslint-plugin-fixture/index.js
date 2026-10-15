// Minimal self-contained ESLint plugin used only by the test suite, so the lint
// tool's structured-output path can be exercised without any external/design-system
// plugin. One rule that flags an identifier literally named `foo`.
const noFoo = {
  meta: { type: 'problem', docs: { description: "disallow an identifier named 'foo'" }, schema: [] },
  create(context) {
    return {
      Identifier(node) {
        if (node.name === 'foo') context.report({ node, message: "Avoid the identifier 'foo'." });
      },
    };
  },
};

// A fixable rule, for the "fixable — make these line edits" output.
const noBar = {
  meta: { type: 'suggestion', fixable: 'code', docs: { description: "rename 'bar' to 'baz'" }, schema: [] },
  create(context) {
    return {
      Identifier(node) {
        if (node.name === 'bar') {
          context.report({ node, message: "Use 'baz', not 'bar'.", fix: (fixer) => fixer.replaceText(node, 'baz') });
        }
      },
    };
  },
};

const plugin = {
  meta: { name: 'eslint-plugin-fixture', version: '1.0.0' },
  rules: { 'no-foo': noFoo, 'no-bar': noBar },
  configs: {},
};

// `recommended` as a rules-bearing object — the shape rulesFromPlugin() expects.
plugin.configs.recommended = { rules: { 'fixture/no-foo': 'warn', 'fixture/no-bar': 'warn' } };

export default plugin;
