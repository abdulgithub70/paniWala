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

  if (config.STATIC_OTP_ENABLED === 'true') {
    const code = String(config.STATIC_OTP_CODE ?? '');
    if (!/^\d{6}$/.test(code)) {
      throw new Error('STATIC_OTP_CODE must be exactly 6 digits when STATIC_OTP_ENABLED=true');
    }
    if (config.NODE_ENV === 'production' && ['123456', '000000', '111111', '654321'].includes(code)) {
      throw new Error('STATIC_OTP_CODE is too easy to guess for production, choose another 6 digits');
    }
  }
  return config;
}
