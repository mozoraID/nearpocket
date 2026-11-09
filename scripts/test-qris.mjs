/**
 * Launcher so `node scripts/test-qris.mjs` and `npm run test:qris` both
 * run the real parser tests under Node's type stripper.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "--disable-warning=ExperimentalWarning",
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--import",
    path.join(dir, "register-ts.mjs"),
    path.join(dir, "test-emvco.mts"),
  ],
  { stdio: "inherit", cwd: path.join(dir, "..") },
);
process.exit(result.status ?? 1);
