import { pageMetadata } from "@/lib/seo";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { policyBySlug } from "@/lib/policies";

const doc = policyBySlug("website-disclaimer");

export const metadata = pageMetadata({
  title: doc.title,
  description: doc.description,
  path: doc.path,
});

/** website-disclaimer — the client's reviewed wording, `lib/policies/`. */
export default function Page() {
  return <PolicyDocument doc={doc} />;
}
