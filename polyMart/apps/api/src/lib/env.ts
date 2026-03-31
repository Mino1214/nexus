export const DEFAULT_JWT_SECRET = "polywatch-dev-secret";
const DEFAULT_EXTERNAL_ADMIN_SSO_SECRET = "polywatch-pandora-local-sso-secret";

function parseCsv(value?: string) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidUrl(value?: string) {
  if (!value?.trim()) {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function getPort() {
  const parsed = Number(process.env.PORT ?? 43121);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT ?? ""}`);
  }

  return parsed;
}

export function getHost() {
  const value = process.env.HOST?.trim();
  if (value) {
    return value;
  }

  return process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
}

export function hasSafeJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  return Boolean(secret && secret !== DEFAULT_JWT_SECRET && secret.toLowerCase() !== "change-me");
}

export function hasAdminAllowlist() {
  return parseCsv(process.env.ADMIN_EMAILS).length > 0 || parseCsv(process.env.ADMIN_USERNAMES).length > 0;
}

export function getExternalAdminSsoSecret() {
  const configured = process.env.EXTERNAL_ADMIN_SSO_SECRET?.trim();
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEFAULT_EXTERNAL_ADMIN_SSO_SECRET;
  }

  return "";
}

export function getExternalAdminSsoIssuer() {
  return process.env.EXTERNAL_ADMIN_SSO_ISSUER?.trim() || "pandora-admin";
}

export function getExternalAdminSsoAudience() {
  return process.env.EXTERNAL_ADMIN_SSO_AUDIENCE?.trim() || "polywatch-admin";
}

export function hasExternalAdminSsoConfigured() {
  return Boolean(getExternalAdminSsoSecret());
}

export function getAdminAuthMode() {
  return hasAdminAllowlist() ? "allowlist" : "dev-fallback";
}

export function validateEnvironment() {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  try {
    getPort();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Invalid PORT");
  }

  try {
    getHost();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Invalid HOST");
  }

  if (!isValidUrl(process.env.WEB_ORIGIN ?? "http://127.0.0.1:43120")) {
    errors.push(`Invalid WEB_ORIGIN: ${process.env.WEB_ORIGIN ?? ""}`);
  }

  if (process.env.DATABASE_URL && !isValidUrl(process.env.DATABASE_URL)) {
    errors.push("DATABASE_URL must be a valid URL.");
  }

  if (process.env.REDIS_URL && !isValidUrl(process.env.REDIS_URL)) {
    errors.push("REDIS_URL must be a valid URL.");
  }

  if (!hasSafeJwtSecret()) {
    if (isProduction) {
      errors.push("JWT_SECRET must be set to a non-default value in production.");
    } else {
      warnings.push("JWT_SECRET is using a development placeholder. Set a custom secret for stable local sessions.");
    }
  }

  if (!hasAdminAllowlist()) {
    if (isProduction) {
      errors.push("ADMIN_EMAILS or ADMIN_USERNAMES must be configured in production.");
    } else {
      warnings.push("Admin allowlist is not configured. Falling back to the local demo admin account.");
    }
  }

  if (process.env.NODE_ENV === "production" && process.env.EXTERNAL_ADMIN_SSO_SECRET && !process.env.EXTERNAL_ADMIN_SSO_SECRET.trim()) {
    errors.push("EXTERNAL_ADMIN_SSO_SECRET must not be blank when configured.");
  }

  return {
    errors,
    warnings,
  };
}

export function assertEnvironment() {
  const result = validateEnvironment();

  for (const warning of result.warnings) {
    console.warn(`[env] ${warning}`);
  }

  if (result.errors.length > 0) {
    throw new Error(`Environment validation failed:\n- ${result.errors.join("\n- ")}`);
  }
}
