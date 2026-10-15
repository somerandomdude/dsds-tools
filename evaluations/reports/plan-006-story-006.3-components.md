# Plan 006 / Story 006.3 — live component contracts

Date: 2026-09-09

## Result

Story 006.3 is complete. On the `dsdsds` branch
`codex/006-v020-settings-corpus`, Text Input and Checkbox now expose the
smallest public API needed by the settings-page controller:

- `ds-text-input.value` reads and writes the live native input value;
- `ds-checkbox.checked` reads and writes the live native checkbox state;
- unrelated attribute changes no longer reset user-edited live state;
- `input` and `change` events are exposed at each custom-element host as
  bubbling, composed events; non-composed native events are forwarded once;
- property setters update state without dispatching user-change events;
- neither component is form-associated, so a controller must use the public
  properties rather than shadow-root access or native form submission.

Button required no API change. Its existing host activation behavior is covered
by the same browser contract fixture.

## Verification

The browser fixture
`test/story-006-3-contract.html` was served from the repository's local
development server and passed **11/11 checks** in the Codex in-app browser:

- Text Input getter/setter behavior and attribute-reset behavior;
- Text Input input/change event target, bubbling, and composed behavior;
- Checkbox initial state, user toggle, getter/setter behavior, and event
  forwarding;
- preservation of live state across an unrelated `error` attribute change;
- Button activation reaching the host.

The browser console reported no errors. The first run exposed that Chrome's
native checkbox `change` event is not composed; the implementation now forwards
that event at the host, and the rerun passed all 11 checks.

Repository checks also passed:

```sh
npm test
node --check src/components/text-input.js
node --check src/components/checkbox.js
node --check src/components/button.js
node ../dsds-tools/packages/cli/src/index.js doctor --config dsds.v020.config.mjs
node ../dsds-tools/packages/cli/src/index.js context account-settings --config dsds.v020.config.mjs --json
```

`doctor` still passes all seven v0.20 entities, with no unresolved targets,
cycles, schema failures, or version drift. The rendered Account Settings
context now describes the live properties and forwarded events while keeping
the page controller as a Story 006.4 responsibility.

## Boundary

No settings page was generated, no Qwen prompt or model run was added, and no
form association was introduced. Story 006.4 may now consume these public APIs
to build the disposable local prototype.
