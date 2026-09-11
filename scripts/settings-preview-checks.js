// Trusted harness checks. Shadow access here simulates native user edits;
// generated controllers are required to use the public host APIs.
const frame = document.querySelector('#preview');
const output = document.querySelector('#results');
const results = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const check = async (name, run) => {
  try { await run(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
  output.textContent = results.map(r => `${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.error ? ': ' + r.error : ''}`).join('\n');
};
frame.addEventListener('load', async () => {
  try {
  const doc = frame.contentDocument;
  const controls = ['display-name', 'email', 'product-updates', 'account-activity'].map(id => doc.getElementById(id));
  const state = () => controls.map((el, i) => i < 2 ? el.value : el.checked);
  const equal = expected => JSON.stringify(state()) === JSON.stringify(expected);
  function edit(values) {
    controls.forEach((el, i) => {
      const native = el.shadowRoot.querySelector('input');
      if (i < 2) {
        native.value = values[i];
        native.dispatchEvent(new frame.contentWindow.InputEvent('input', { bubbles: true, composed: true }));
        native.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }));
      } else if (native.checked !== values[i]) native.click();
    });
  }
  const activate = id => doc.getElementById(id).shadowRoot.querySelector('button').click();
  await check('All three component modules registered', () => {
    for (const tag of ['ds-button', 'ds-checkbox', 'ds-text-input']) assert(frame.contentWindow.customElements.get(tag), `Missing ${tag}`);
    assert(controls.every(Boolean), 'Missing control IDs');
  });
  const initial = state();
  await check('Native edits update public value and checked properties', () => {
    const edited = ['Before save', 'before@example.com', !initial[2], !initial[3]];
    edit(edited); assert(equal(edited), 'Live properties do not match user input');
  });
  await check('Cancel before first Save restores initial snapshot', () => { activate('cancel'); assert(equal(initial), 'Initial snapshot not restored'); });
  const saved = ['Saved profile', 'saved@example.com', true, false];
  await check('Save shows visible status feedback', () => {
    const status = doc.getElementById('status');
    // Do not mistake leftover Cancel feedback for a working Save handler.
    assert(status, 'Missing status');
    status.textContent = '';
    edit(saved); activate('save');
    assert(status?.textContent.trim(), 'Empty status');
    assert(status.getClientRects().length && frame.contentWindow.getComputedStyle(status).visibility !== 'hidden', 'Status hidden');
  });
  await check('Cancel restores all four values to LAST SAVED state', () => {
    edit(['Discard me', 'discard@example.com', !saved[2], !saved[3]]); activate('cancel');
    assert(equal(saved), 'Last saved snapshot not restored');
  });
  await check('A second Save replaces the previous snapshot', () => {
    const second = ['Second save', 'second@example.com', false, true];
    edit(second); activate('save'); edit(saved); activate('cancel'); assert(equal(second), 'Second snapshot not restored');
  });
  await check('Each control has a nonempty label slot', () => {
    assert(controls.every(el => el.querySelector('[slot="label"]')?.textContent.trim()), 'Missing label');
  });
  for (const width of [375, 1280]) {
    frame.style.width = `${width}px`;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await check(`No horizontal overflow at ${width}px`, () => assert(doc.documentElement.scrollWidth <= doc.documentElement.clientWidth + 1, `${doc.documentElement.scrollWidth}px exceeds ${doc.documentElement.clientWidth}px`));
  }
  frame.style.width = '375px';
  output.textContent += `\n\n${results.filter(r => r.pass).length}/${results.length} browser checks passed.\nReview keyboard interaction and visual layout separately.`;
  document.title = results.every(r => r.pass) ? 'PASS — Settings preview verification' : 'FAIL — Settings preview verification';
  } catch (error) {
    output.textContent += `\nFAIL Browser checks could not finish: ${error.message}`;
    document.title = 'FAIL — Settings preview verification';
  }
}, { once: true });
frame.src = '/';
