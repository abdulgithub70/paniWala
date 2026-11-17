const REQUIRED = ['DATABASE_URL', 'DIRECT_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED.filter((k) => !config[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (config.NODE_ENV === 'production') {
    if (config.DEV_OTP_ENABLED === 'true') {
      throw new Error('DEV_OTP_ENABLED must not be true in production');
    }
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if (String(config[key]).length < 32) {
        throw new Error(`${key} must be at least 32 characters in production`);
      }
    }
  }
  return config;
}
