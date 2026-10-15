export function renderLayoutPreview(result) {
  if (!result?.score?.pass) throw new Error('Only a passing evaluation result can be rendered');
  const response = typeof result.response === 'string' ? JSON.parse(result.response) : result.response;
  if (response?.status !== 'supported' || !response.layout || !Array.isArray(response.layout.regions)) {
    throw new Error('Result does not contain a supported layout response');
  }
  if (response.layout.kind === 'settings-page') return renderSettings(response.layout.regions);
  if (response.layout.kind === 'documentation-page') return renderDocumentation(response.layout.regions);
  throw new Error(`Unsupported layout kind: ${response.layout.kind}`);
}

function renderSettings(regions) {
  const title = titleFor(regions, 'page-header', 'Settings');
  const sections = regions.filter(region => region.kind === 'settings-section')
    .map(region => `<section data-dsds-region="settings-section"><h2>${escapeHtml(region.title)}</h2><p>Review and update this group of settings.</p><label>${escapeHtml(region.title)} preference <input type="text"></label><p><button type="button">Save ${escapeHtml(region.title)}</button></p></section>`)
    .join('\n');
  const destructive = regions.some(region => region.kind === 'destructive-section')
    ? `<section data-dsds-region="destructive-section"><h2>${escapeHtml(titleFor(regions, 'destructive-section', 'Destructive actions'))}</h2><p>This action is irreversible and requires confirmation.</p><button type="button" aria-haspopup="dialog">Continue</button></section>` : '';
  return page(title, `<header data-dsds-region="page-header"><h1>${escapeHtml(title)}</h1><p>Review and update your preferences.</p></header>${sections}${destructive}`);
}

function renderDocumentation(regions) {
  const title = titleFor(regions, 'page-header', 'Documentation');
  const nav = regions.some(region => region.kind === 'in-page-navigation')
    ? `<nav data-dsds-region="in-page-navigation" aria-label="On this page"><a href="#usage">Usage</a><a href="#example">Example</a><a href="#references">References</a></nav>` : '';
  const content = regions.some(region => region.kind === 'content')
    ? '<section id="usage" data-dsds-region="content"><h2>Usage</h2><p>Follow the documented guidance for this artifact.</p></section>' : '';
  const example = regions.some(region => region.kind === 'example-region')
    ? '<section id="example" data-dsds-region="example-region"><h2>Example</h2><button type="button">Example action</button></section>' : '';
  const references = regions.some(region => region.kind === 'reference-region')
    ? '<section id="references" data-dsds-region="reference-region"><h2>References</h2><p>See the linked DSDS evidence for implementation details.</p></section>' : '';
  return page(title, `<header data-dsds-region="page-header"><h1>${escapeHtml(title)}</h1><p>Documentation generated from a validated DSDS layout.</p></header>${nav}${content}${example}${references}`);
}

function page(title, body) {
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${escapeHtml(title)}</title>\n  <link rel="stylesheet" href="/docs-site/tokens.css">\n  <link rel="stylesheet" href="/docs-site/style.css">\n  <link rel="stylesheet" href="/layout-preview.css">\n</head>\n<body>\n  <main class="layout-preview content__inner">${body}</main>\n</body>\n</html>\n`;
}

function titleFor(regions, kind, fallback) { return regions.find(region => region.kind === kind)?.title ?? fallback; }
function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
