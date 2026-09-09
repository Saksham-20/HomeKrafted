/**
 * The scanner's eyesight. Every structural spec is only as good as this.
 */
import { stripComments } from "@/lib/testing/strip-comments";

test("a route pattern in prose does not open a comment", () => {
  // The measured bug: `/auth/*` inside a JSDoc was read as an opener, so
  // everything to the next `*/` — often hundreds of lines — vanished.
  const source = [
    "/**",
    " * Calls POST /auth/* and /seller/* on purpose.",
    " */",
    "const kept = 1;",
    "/** Another comment. */",
    "const alsoKept = 2;",
  ].join("\n");
  const out = stripComments(source);
  expect(out).toMatch(/const kept = 1;/);
  expect(out).toMatch(/const alsoKept = 2;/);
  expect(out).not.toMatch(/on purpose/);
});

test("the old one-line recipe really did lose the code — this is the regression", () => {
  // The measured shape, from `AuthContext.tsx`: a **line** comment
  // mentioning a route pattern. The old recipe stripped block comments
  // first, so it saw an opener inside that line comment and paired it
  // with the closer of the next JSDoc — swallowing every line between.
  const source = [
    "// written when /seller/" + "* and /admin/" + "* were mock",
    "const survives = 1;",
    "/** A later comment, whose closer gets stolen. */",
    "const alsoSurvives = 2;",
  ].join("\n");

  const old = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  expect(old).not.toMatch(/const survives = 1;/);

  const now = stripComments(source);
  expect(now).toMatch(/const survives = 1;/);
  expect(now).toMatch(/const alsoSurvives = 2;/);
  expect(now).not.toMatch(/written when/);
});

test("line comments go, and the newline stays", () => {
  const out = stripComments("const a = 1; // gone\nconst b = 2;");
  expect(out).not.toMatch(/gone/);
  expect(out.split("\n")).toHaveLength(2);
  expect(out).toMatch(/const b = 2;/);
});

test("a URL's // is not a line comment", () => {
  // The old recipe guarded this with `[^:]`; the state machine sees the
  // string instead, which also covers a protocol-relative `//host`.
  const out = stripComments('const u = "https://example.com/a"; // gone');
  expect(out).toMatch(/https:\/\/example\.com\/a/);
  expect(out).not.toMatch(/gone/);
});

test("comment markers inside strings and templates survive", () => {
  expect(stripComments('const a = "/* not a comment */";')).toMatch(/\/\* not a comment \*\//);
  expect(stripComments("const b = `/admin/*`;")).toMatch(/\/admin\/\*/);
  expect(stripComments("const c = '// still text';")).toMatch(/\/\/ still text/);
});

test("an escaped quote does not end the string", () => {
  const out = stripComments('const a = "he said \\"/*\\" and meant it"; const b = 2;');
  expect(out).toMatch(/const b = 2;/);
});

test("line count is preserved, so line-anchored scans stay aligned", () => {
  const source = ["const a = 1;", "/*", " * three", " * lines", " */", "const b = 2;"].join("\n");
  expect(stripComments(source).split("\n")).toHaveLength(source.split("\n").length);
});
