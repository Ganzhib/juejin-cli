#!/usr/bin/env node
import { startCli } from './cli/start.js';

process.exitCode = await startCli(process.argv.slice(2));
