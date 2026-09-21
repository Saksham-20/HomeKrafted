import { existsSync } from "node:fs";
import { join } from "node:path";
import robots from "@/app/robots";
import { LEGAL_ENTITY, missingDetails, type LegalEntity } from "@/lib/legal";
import {
  FOOTER_COLUMNS,
  POLICY_DOCS,
  SITEMAP_GROUPS,
  policyBySlug,
  type PolicyBlock,
} from "./index";
import { splitPolicyText } from "./tokens";

/*
  The client's policy documents are data, and these are the checks that keep
  the frame around them honest. They deliberately say nothing about what a
  sentence *says* — that is the client's — only that every document is
  reachable, listed where it should be, and free of the fill-in tags the
  paste arrived with.
*/

const APP_ROOT = join(__dirname, "..", "..", "app");

/** Every string a document renders, in order. */
function textOf(blocks: readonly PolicyBlock[]): string[] {
  return blocks.flatMap((block) => {
    switch (block.kind) {
      case "h2":
      case "p":
        return [block.text];
      case "ul":
        return [...block.items];
      case "lines":
        return [...block.lines];
      case "officer":
        return [];
    }
  });
}

function pageExists(path: string): boolean {
  const dir = path === "/" ? APP_ROOT : join(APP_ROOT, ...path.split("/").filter(Boolean));
  return existsSync(join(dir, "page.tsx"));
}

describe("policy documents", () => {
  it("are the sixteen the client sent, each with a unique slug and route", () => {
    expect(POLICY_DOCS).toHaveLength(16);
    expect(new Set(POLICY_DOCS.map((doc) => doc.slug)).size).toBe(16);
    expect(new Set(POLICY_DOCS.map((doc) => doc.path)).size).toBe(16);
  });

  it.each(POLICY_DOCS.map((doc) => [doc.slug, doc] as const))(
    "%s has a route, an opening paragraph and a searchable description",
    (_slug, doc) => {
      expect(doc.path).toBe(`/${doc.slug}`);
      expect(pageExists(doc.path)).toBe(true);
      expect(doc.title.trim()).not.toBe("");
      expect(doc.lead.trim()).not.toBe("");
      expect(doc.blocks.length).toBeGreaterThan(0);
      expect(doc.description.length).toBeLessThanOrEqual(160);
    },
  );

  it("never sit under a prefix the app treats as a portal or a crawler as private", () => {
    // `/seller-terms` once did: `ConsumerChrome` and `LocationPrompt` match
    // `pathname.startsWith("/seller")`, so the page rendered with no header
    // or footer, and `robots.ts` disallows the prefix, so it was unindexable.
    const rules = robots().rules;
    const disallowed = [
      "/seller",
      "/admin",
      ...((Array.isArray(rules) ? rules[0] : rules).disallow as string[]),
    ];
    for (const doc of POLICY_DOCS) {
      for (const prefix of disallowed) {
        expect({ path: doc.path, prefix, hit: doc.path.startsWith(prefix) }).toEqual({
          path: doc.path,
          prefix,
          hit: false,
        });
      }
    }
  });

  it("never carry a fill-in tag or an unknown token", () => {
    for (const doc of POLICY_DOCS) {
      for (const text of [doc.lead, ...textOf(doc.blocks)]) {
        expect(text).not.toMatch(/\[INSERT/i);
        for (const part of splitPolicyText(text)) {
          // An unknown `{{name}}` is left as text so it shows on the page —
          // which means none may be present.
          if (part.type === "text") expect(part.value).not.toContain("{{");
        }
      }
    }
  });

  it("never hardcode an email address — it comes from lib/legal.ts", () => {
    for (const doc of POLICY_DOCS) {
      for (const text of [doc.lead, ...textOf(doc.blocks)]) {
        const literal = splitPolicyText(text).filter((part) => part.type === "email");
        expect(literal).toEqual([]);
      }
    }
  });

  it("print the company's own details on the grievance page and nowhere else", () => {
    const withDetails = POLICY_DOCS.filter((doc) => doc.showsBusinessDetails).map((doc) => doc.slug);
    expect(withDetails).toEqual(["grievance-redressal"]);
    expect(policyBySlug("grievance-redressal").blocks.some((block) => block.kind === "officer")).toBe(true);
    for (const doc of POLICY_DOCS) {
      if (doc.slug === "grievance-redressal") continue;
      expect(doc.blocks.some((block) => block.kind === "officer")).toBe(false);
    }
  });
});

describe("the footer and the sitemap page", () => {
  const listed = (columns: readonly { links: readonly { href: string }[] }[]) =>
    columns.flatMap((column) => column.links.map((link) => link.href));

  it("list every document in the footer, once", () => {
    const hrefs = listed(FOOTER_COLUMNS);
    for (const doc of POLICY_DOCS) {
      expect(hrefs.filter((href) => href === doc.path)).toHaveLength(1);
    }
  });

  it("keep the client's four columns, in order", () => {
    expect(FOOTER_COLUMNS.map((column) => column.title)).toEqual([
      "Consumer Policy",
      "Homekrafted",
      "Sellers",
      "Compliance",
    ]);
  });

  it("list every document on the sitemap page", () => {
    const hrefs = listed(SITEMAP_GROUPS);
    for (const doc of POLICY_DOCS) expect(hrefs).toContain(doc.path);
  });

  it("only link to pages that exist", () => {
    for (const href of [...listed(FOOTER_COLUMNS), ...listed(SITEMAP_GROUPS)]) {
      expect({ href, exists: pageExists(href) }).toEqual({ href, exists: true });
    }
  });
});

describe("splitPolicyText", () => {
  it("finds a token between two runs of text", () => {
    expect(splitPolicyText("Email: {{supportEmail}} today")).toEqual([
      { type: "text", value: "Email: " },
      { type: "token", name: "supportEmail" },
      { type: "text", value: " today" },
    ]);
  });

  it("links a literal address and leaves plain text alone", () => {
    expect(splitPolicyText("write to a.b@homekrafted.in.")).toEqual([
      { type: "text", value: "write to " },
      { type: "email", value: "a.b@homekrafted.in" },
      { type: "text", value: "." },
    ]);
    expect(splitPolicyText("No tokens here.")).toEqual([{ type: "text", value: "No tokens here." }]);
  });

  it("leaves an unknown token as visible text rather than swallowing it", () => {
    expect(splitPolicyText("{{oops}}")).toEqual([{ type: "text", value: "{{oops}}" }]);
  });
});

describe("missingDetails", () => {
  const complete: LegalEntity = {
    legalName: "Tics Foodworks Pvt. Ltd.",
    address: ["1 Some Road"],
    supportEmail: "info@homekrafted.in",
    grievanceEmail: "g@homekrafted.in",
    grievanceOfficer: "A. Person",
    supportPhone: "+91 00000 00000",
    supportHours: "10am – 7pm",
  };

  it("is empty once everything is filled in", () => {
    expect(missingDetails(complete)).toEqual([]);
  });

  it("names exactly what is still a placeholder", () => {
    const pending = { ...complete, address: ["TO BE FILLED"], grievanceOfficer: "TO BE FILLED" };
    expect(missingDetails(pending)).toEqual(["registered office address", "grievance officer"]);
  });

  it("no longer reports the company name, which the client supplied", () => {
    expect(missingDetails(LEGAL_ENTITY)).not.toContain("company name");
  });
});
