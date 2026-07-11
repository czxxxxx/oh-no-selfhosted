#!/usr/bin/env node
import { cliMain } from "./serviceManager.mjs";

const exitCode = await cliMain();
process.exit(exitCode);
