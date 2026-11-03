// Integration tests wipe their database, so they ALWAYS use a dedicated one and never
// inherit DATABASE_URL from the shell (which could point to development data).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/agendo_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough-for-validation';
