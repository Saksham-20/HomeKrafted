import { instagramEmbedUrl, instagramPermalink, instagramShortcode } from "./instagram";

describe("instagramShortcode", () => {
  it("reads the code out of a reel URL", () => {
    expect(instagramShortcode("https://www.instagram.com/reel/DcBdttehGMO/")).toBe("DcBdttehGMO");
  });

  it("survives the share parameter people actually paste", () => {
    expect(
      instagramShortcode("https://www.instagram.com/reel/DcBdttehGMO/?igsi=MXAyY282ZndsOWlheA=="),
    ).toBe("DcBdttehGMO");
  });

  it("accepts /p/ and /tv/ and a missing www", () => {
    expect(instagramShortcode("https://instagram.com/p/ABC123def/")).toBe("ABC123def");
    expect(instagramShortcode("https://www.instagram.com/tv/XYZ_789-a")).toBe("XYZ_789-a");
  });

  it("accepts the /<user>/reel/<code>/ form", () => {
    expect(instagramShortcode("https://www.instagram.com/eatwith_aditi/reel/DcBdttehGMO/")).toBe(
      "DcBdttehGMO",
    );
  });

  it("answers undefined for anything that is not one, rather than throwing", () => {
    expect(instagramShortcode("https://example.com/reel/nope")).toBeUndefined();
    expect(instagramShortcode("")).toBeUndefined();
    expect(instagramShortcode("not a url at all")).toBeUndefined();
  });
});

describe("embed + permalink", () => {
  it("builds the captioned embed, because the caption is the point", () => {
    expect(instagramEmbedUrl("https://www.instagram.com/reel/DcBdttehGMO/?igsi=x")).toBe(
      "https://www.instagram.com/reel/DcBdttehGMO/embed/captioned/",
    );
  });

  it("normalises a shared link back to the canonical permalink", () => {
    expect(instagramPermalink("https://www.instagram.com/reel/DcBdttehGMO/?igsi=x")).toBe(
      "https://www.instagram.com/reel/DcBdttehGMO/",
    );
  });

  it("passes the undefined through instead of building a broken URL", () => {
    expect(instagramEmbedUrl("https://example.com/x")).toBeUndefined();
    expect(instagramPermalink("https://example.com/x")).toBeUndefined();
  });
});
