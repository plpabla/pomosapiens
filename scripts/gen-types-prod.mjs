import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const CLI_VERSION = "2.108.0";
const OUTPUT_PATH = "src/db/database.types.ts";

const projectRef = process.env.SUPABASE_PROJECT_REF;
if (!projectRef) {
  console.error("SUPABASE_PROJECT_REF env var is required");
  process.exit(1);
}
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN env var is required");
  process.exit(1);
}

if (!/^[a-z0-9]+$/.test(projectRef)) {
  console.error(`SUPABASE_PROJECT_REF has unexpected characters: ${projectRef}`);
  process.exit(1);
}

const output = execSync(`npx -y supabase@${CLI_VERSION} gen types typescript --project-id ${projectRef}`, {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "inherit"],
});

writeFileSync(OUTPUT_PATH, output, "utf8");
console.log(`Wrote ${OUTPUT_PATH} (${output.length} bytes) using supabase CLI ${CLI_VERSION}`);
