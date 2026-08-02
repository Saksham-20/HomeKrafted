/**
 * Unit tests — no database, no HTTP, no Nest module graph.
 *
 * Everything here runs against real code with hand-built inputs: pure
 * functions, and services instantiated directly with a stub Prisma where
 * the logic under test doesn't touch it. Anything that genuinely needs the
 * database is an end-to-end test instead (`test/jest-e2e.json`) — mocking
 * Prisma deeply enough to "test" a query only ever tests the mock.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test/unit'],
  testMatch: ['**/*.spec.ts'],
  clearMocks: true,
};
