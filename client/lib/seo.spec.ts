import { SITE_URL, absoluteUrl, jsonLdProps, pageMetadata } from "@/lib/seo";

/**
 * SEO fails silently. A page that ships a title but no canonical, or a
 * relative Open Graph image, looks completely fine in a browser and is
 * simply ignored by crawlers and unfurlers — which is why M15 routed
 * everything through one helper rather than trusting ~65 route files to
 * remember. These are the invariants that make that helper worth using.
 */

describe("absoluteUrl", () => {
  it("is absolute — relative URLs are silently dropped by crawlers", () => {
    expect(absoluteUrl("/shop")).toBe(`${SITE_URL}/shop`);
  });

  it("tolerates a missing leading slash rather than producing a broken host", () => {
    expect(absoluteUrl("shop")).toBe(`${SITE_URL}/shop`);
  });

  it("never doubles the slash", () => {
    expect(SITE_URL.endsWith("/")).toBe(false);
    expect(absoluteUrl("/")).not.toContain("//shop");
    expect(absoluteUrl("/shop")).not.toMatch(/[^:]\/\//);
  });
});

describe("pageMetadata", () => {
  const meta = pageMetadata({
    title: "Mango thokku pickle",
    description: "Slow-cooked in small batches in Sector 34.",
    path: "/product/mango-thokku-pickle",
  });

  it("always emits a canonical, which is the whole reason it exists", () => {
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/product/mango-thokku-pickle`);
  });

  it("carries the title and description into Open Graph and Twitter", () => {
    expect(meta.openGraph?.title).toBe("Mango thokku pickle");
    expect(meta.twitter?.title).toBe("Mango thokku pickle");
    expect(meta.openGraph?.description).toBe("Slow-cooked in small batches in Sector 34.");
    expect(meta.twitter?.description).toBe("Slow-cooked in small batches in Sector 34.");
  });

  it("makes the OG image absolute even when given a root-relative path", () => {
    const images = meta.openGraph?.images as { url: string }[];
    expect(images[0].url.startsWith("http")).toBe(true);
    expect(images[0].url).toBe(`${SITE_URL}/images/site/hero-hamper.jpg`);
  });

  it("leaves an already-absolute image alone", () => {
    const withRemote = pageMetadata({
      title: "T",
      description: "D",
      path: "/x",
      image: "https://cdn.example.com/a.jpg",
    });
    const images = withRemote.openGraph?.images as { url: string }[];
    expect(images[0].url).toBe("https://cdn.example.com/a.jpg");
  });

  it("indexes by default and only noindexes when asked", () => {
    // Getting this backwards would deindex the catalogue, and nothing on
    // the page would look wrong.
    expect(meta.robots).toBeUndefined();
    const priv = pageMetadata({ title: "T", description: "D", path: "/wallet", noindex: true });
    expect(priv.robots).toEqual({ index: false, follow: true });
  });

  it("defaults to a website, and takes article when asked", () => {
    // Next's `OpenGraph` is a discriminated union on `type`, so reading
    // the discriminant back needs a widening cast.
    const ogType = (og: typeof meta.openGraph) => (og as { type?: string } | undefined)?.type;
    expect(ogType(meta.openGraph)).toBe("website");
    const guide = pageMetadata({ title: "T", description: "D", path: "/g", type: "article" });
    expect(ogType(guide.openGraph)).toBe("article");
  });
});

describe("jsonLdProps", () => {
  it("escapes `<` so a product name can never close the script element", () => {
    // `</script>` inside a JSON-LD block ends the block early and puts the
    // rest of the payload into the document as markup.
    const props = jsonLdProps({ name: "Pickle </script><img src=x onerror=alert(1)>" });
    expect(props.dangerouslySetInnerHTML.__html).not.toContain("</script>");
    expect(props.dangerouslySetInnerHTML.__html).not.toContain("<img");
    expect(props.dangerouslySetInnerHTML.__html).toContain("\\u003c/script");
  });

  it("stays valid JSON after escaping", () => {
    const props = jsonLdProps({ "@type": "Product", name: "A < B" });
    // The escape is a JSON string escape, so a parser round-trips it back
    // to the original text — crawlers must still see the real name.
    expect(JSON.parse(props.dangerouslySetInnerHTML.__html)).toEqual({
      "@type": "Product",
      name: "A < B",
    });
  });

  it("declares the type crawlers look for", () => {
    expect(jsonLdProps({}).type).toBe("application/ld+json");
  });
});
