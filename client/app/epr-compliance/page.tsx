import { pageMetadata } from "@/lib/seo";
import { PolicyDocument } from "@/components/legal/PolicyDocument";
import { policyBySlug } from "@/lib/policies";

const doc = policyBySlug("epr-compliance");

export const metadata = pageMetadata({
  title: doc.title,
  description: doc.description,
  path: doc.path,
});

/** epr-compliance — the client's reviewed wording, `lib/policies/`. */
export default function Page() {
  return <PolicyDocument doc={doc} />;
}
