#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatEmission } from "../src/format.js";
import { runCliScan } from "../src/mcp-server.js";

const outputPath = path.join(os.tmpdir(), "env-mapper-build-check.json");
const emission = runCliScan("test/fixtures/basic", {
  root: "test/fixtures/basic",
  emit: "all",
  format: "json",
  provider: "infisical"
});

fs.writeFileSync(outputPath, formatEmission(emission, "json"), "utf8");
