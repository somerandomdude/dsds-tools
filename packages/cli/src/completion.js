// Shell completion.
//
// Identifiers are this CLI's main argument and nobody remembers 199 of them;
// without completion the routine move is `dsds list | grep`, then retype.
// The scripts complete commands and flags statically, and identifiers by
// shelling out to `dsds list --json`, so completion reflects whatever
// document the current directory resolves to.

import { PORCELAIN } from './porcelain.js';
import { SURFACE_COMMANDS } from './surface-commands.js';

const EXTRA_COMMANDS = ['tool', 'doctor', 'init', 'manifest', 'completion', 'help', 'version'];

// Commands whose first positional is an entity identifier.
const IDENTIFIER_COMMANDS = [
  'get', 'context', 'chunk', 'build', 'deps', 'dependents',
  'impact', 'alternatives', 'markdown', 'resource',
];

const GLOBAL_FLAGS = ['--json', '--config', '--quiet', '--no-log', '--help'];

export const SHELLS = ['bash', 'zsh', 'fish'];

function commandNames() {
  return [...Object.keys(PORCELAIN), ...Object.keys(SURFACE_COMMANDS), ...EXTRA_COMMANDS].sort();
}

function bash(commands, identifierCommands, flags) {
  return `# dsds bash completion — eval "$(dsds completion bash)"
_dsds_completions() {
  local cur prev cmd
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cmd="\${COMP_WORDS[1]}"

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${commands.join(' ')}" -- "$cur") )
    return
  fi

  case "$cur" in
    -*) COMPREPLY=( $(compgen -W "${flags.join(' ')}" -- "$cur") ); return ;;
  esac

  case " ${identifierCommands.join(' ')} " in
    *" $cmd "*)
      if [ "$COMP_CWORD" -eq 2 ]; then
        local ids
        ids=$(dsds list --json --quiet 2>/dev/null | sed -n 's/.*"identifier": "\\([^"]*\\)".*/\\1/p')
        COMPREPLY=( $(compgen -W "$ids" -- "$cur") )
        return
      fi
      ;;
  esac
}
complete -F _dsds_completions dsds
`;
}

function zsh(commands, identifierCommands, flags) {
  return `# dsds zsh completion — eval "$(dsds completion zsh)"
_dsds() {
  local -a commands identifier_commands
  commands=(${commands.map(c => `'${c}'`).join(' ')})
  identifier_commands=(${identifierCommands.map(c => `'${c}'`).join(' ')})

  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi

  if [[ "\${words[CURRENT]}" == -* ]]; then
    compadd ${flags.join(' ')}
    return
  fi

  if (( CURRENT == 3 )) && (( \${identifier_commands[(I)\${words[2]}]} )); then
    local -a ids
    ids=(\${(f)"$(dsds list --json --quiet 2>/dev/null | sed -n 's/.*"identifier": "\\([^"]*\\)".*/\\1/p')"})
    compadd -a ids
    return
  fi
}
compdef _dsds dsds
`;
}

function fish(commands, identifierCommands, flags) {
  const lines = [
    '# dsds fish completion — dsds completion fish | source',
    'function __dsds_identifiers',
    "    dsds list --json --quiet 2>/dev/null | string match -r '\"identifier\": \"[^\"]*\"' | string replace -r '.*: \"(.*)\"' '$1'",
    'end',
    '',
    'complete -c dsds -f',
  ];
  for (const c of commands) {
    lines.push(`complete -c dsds -n '__fish_use_subcommand' -a '${c}'`);
  }
  for (const c of identifierCommands) {
    lines.push(`complete -c dsds -n '__fish_seen_subcommand_from ${c}' -a '(__dsds_identifiers)'`);
  }
  for (const f of flags) {
    lines.push(`complete -c dsds -l '${f.replace(/^--/, '')}'`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Emit a completion script for one shell.
 *
 * @param {string} shell - bash | zsh | fish
 * @returns {string|null} the script, or null for an unsupported shell
 */
export function completionScript(shell) {
  const commands = commandNames();
  switch (shell) {
    case 'bash': return bash(commands, IDENTIFIER_COMMANDS, GLOBAL_FLAGS);
    case 'zsh': return zsh(commands, IDENTIFIER_COMMANDS, GLOBAL_FLAGS);
    case 'fish': return fish(commands, IDENTIFIER_COMMANDS, GLOBAL_FLAGS);
    default: return null;
  }
}

export const COMPLETION_HELP = [
  `dsds completion <${SHELLS.join('|')}>`,
  '',
  'Print a shell completion script. Completes commands, flags, and entity',
  'identifiers from whatever document the current directory resolves to.',
  '',
  'Install:',
  '  bash   eval "$(dsds completion bash)"      # or append to ~/.bashrc',
  '  zsh    eval "$(dsds completion zsh)"       # or append to ~/.zshrc',
  '  fish   dsds completion fish | source       # or > ~/.config/fish/completions/dsds.fish',
].join('\n');
