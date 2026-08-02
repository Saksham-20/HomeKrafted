/**
 * Tests for `client/lib` — the pure modules that decide what the app is
 * allowed to do.
 *
 * **Deliberately `node`, not `jsdom`, and deliberately no component
 * rendering.** Everything under test here is a plain function: the
 * schedule generator, the channel matrix, occasion grouping, geo,
 * formatting, SEO metadata. Those hold the rules that are expensive to get
 * wrong and cheap to check. Rendering React would need jsdom plus Testing
 * Library plus a Next mock surface, and would mostly assert that markup
 * still looks like markup. When DOM behaviour is worth guarding (the
 * dialog focus traps in `MobileDrawer` / `LocationPrompt`), that belongs in
 * a browser-level test, not a simulated one.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Specs sit next to the module they cover, the way each component sits
  // next to its stylesheet.
  roots: ["<rootDir>/lib"],
  testMatch: ["**/*.spec.ts"],
  // Mirrors tsconfig's `@/*` -> `./*`, so tests import exactly what the
  // app imports rather than a relative path that could drift.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // The app's tsconfig is `module: esnext` for the bundler; Jest
          // needs CommonJS. Overridden here rather than in tsconfig.json,
          // which Next owns.
          module: "commonjs",
          moduleResolution: "node",
          jsx: "react-jsx",
          esModuleInterop: true,
          strict: true,
          target: "ES2021",
        },
      },
    ],
  },
  clearMocks: true,
};
