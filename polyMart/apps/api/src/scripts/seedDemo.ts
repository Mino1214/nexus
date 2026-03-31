import "../lib/loadEnv.js";
import { POINT_RULES } from "@polywatch/shared";
import { closeDatabase, findUserByEmail, initDatabase } from "../db/index.js";
import { signupUser } from "../services/auth.js";

const DEMO_USER = {
  username: "myno_demo",
  email: "myno_demo@example.com",
  password: "polywatch123",
  lang: "ko" as const,
};

async function main() {
  await initDatabase();

  const existing = await findUserByEmail(DEMO_USER.email);
  if (!existing) {
    await signupUser(DEMO_USER);
    console.log(`Seeded demo user ${DEMO_USER.email} with ${POINT_RULES.signup}P`);
  } else {
    console.log(`Demo user already exists: ${DEMO_USER.email}`);
  }

  console.log(JSON.stringify({
    email: DEMO_USER.email,
    password: DEMO_USER.password,
    username: DEMO_USER.username,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
