import { notFound } from "next/navigation";
import { QuoteClient } from "@/components/corporate/QuoteClient";
import { getPublicQuote } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Your Homekrafted quote",
  description: "Review and accept your Homekrafted quote.",
  path: "/corporate/quote",
  // Another company's pricing, behind a bearer token. `robots.ts`
  // disallows the path too — this is the per-page belt to that braces.
  noindex: true,
});

/**
 * Rendered per request. A quote's state depends on the clock (`expired`)
 * and on whether somebody has accepted since, so a cached render would
 * show a stale one.
 */
export const dynamic = "force-dynamic";

/**
 * The tokenised quote a procurement manager opens from an email.
 *
 * They are logged out, may never have heard of Homekrafted, and are
 * probably on a phone. So: who this is from, what it is for, the lines,
 * the total they will actually be invoiced, until when, and one primary
 * action — in that order.
 *
 * **No `loading.tsx` above this route.** It can `notFound()`, and a
 * Suspense boundary would start streaming the 200 before the body runs —
 * the soft-404 measured in M15. A bad token has to really 404.
 *
 * The page is one client of `GET /corporate/quotes/:token`, not the flow
 * itself. Accepting is a POST to the API from the button below, never a
 * GET on this URL — an email-security scanner following the link must not
 * be able to accept a ₹50,000 order.
 */
export default async function CorporateQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const quote = await getPublicQuote(token);
  // Never found and revoked are indistinguishable, deliberately — so this
  // cannot tell them apart either.
  if (!quote) notFound();

  return <QuoteClient token={token} initialQuote={quote} />;
}
