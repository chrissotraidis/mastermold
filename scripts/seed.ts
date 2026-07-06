import { mkdir, writeFile } from "node:fs/promises";
import { demoDatabase, getSeedSummary } from "../src/db/seed-data";
import { entitySchemas } from "../src/db/schema";

await mkdir("data", { recursive: true });
await writeFile(
  "data/demo-seed.json",
  `${JSON.stringify({ schemas: entitySchemas, data: demoDatabase }, null, 2)}\n`,
  "utf8",
);

const summary = getSeedSummary();
const reviewerEmail = demoDatabase.users.find((user) => user.role === "reviewer")?.email ?? "reviewer@example.test";
console.log(
  `Seeded ${reviewerEmail} with ${summary.accounts} accounts, ${summary.assets} assets, ${summary.briefingCards} briefing cards, ${summary.alerts} alerts, and ${summary.integrations.join(", ")} integrations.`,
);
