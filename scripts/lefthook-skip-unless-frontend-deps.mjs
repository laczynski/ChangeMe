#!/usr/bin/env node

/** Skips Lefthook frontend commands until the frontend package has been installed. */

import { existsSync } from "node:fs";

process.exit(existsSync("node_modules") ? 1 : 0);
