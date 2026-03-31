import { execFileSync } from "node:child_process";

const PORTS = [43120, 43121, 43122];

function getPidsForPort(port) {
  try {
    const output = execFileSync("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return output
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

const uniquePids = [...new Set(PORTS.flatMap(getPidsForPort))];

if (!uniquePids.length) {
  console.log("No dev ports are in use.");
  process.exit(0);
}

for (const pid of uniquePids) {
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Stopped PID ${pid}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to stop PID ${pid}: ${message}`);
    process.exitCode = 1;
  }
}
