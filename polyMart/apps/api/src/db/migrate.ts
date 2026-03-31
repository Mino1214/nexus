import "../lib/loadEnv.js";
import { getPersistenceMode, initDatabase } from "./index.js";

async function main() {
  await initDatabase();
  console.log(`POLYWATCH DB initialized using ${getPersistenceMode()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
