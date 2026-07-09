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

const plugin = {
  meta: { name: 'eslint-plugin-fixture', version: '1.0.0' },
  rules: { 'no-foo': noFoo },
  configs: {},
};

// `recommended` as a rules-bearing object — the shape rulesFromPlugin() expects.
plugin.configs.recommended = { rules: { 'fixture/no-foo': 'warn' } };

export default plugin;
