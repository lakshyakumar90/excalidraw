// Prefer the dedicated test database when provided; never fall back to a
// development/production URL from inside the test run itself.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
