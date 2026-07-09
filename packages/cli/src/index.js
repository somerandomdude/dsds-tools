#!/usr/bin/env node
import { run } from './cli.js';

run(process.argv.slice(2))
  .then(code => { process.exitCode = code; })
  .catch(err => {
    process.stderr.write(`dsds: ${err.message}\n`);
    process.exitCode = 1;
  });
