import { CorporateInquiryDetailClient } from "@/components/admin/CorporateInquiryDetailClient";

export interface AdminCorporateDetailPageProps {
  params: Promise<{ id: string }>;
}

/** `/admin/corporate/[id]` — one enquiry, and the quotes raised against it. */
export default async function AdminCorporateDetailPage({ params }: AdminCorporateDetailPageProps) {
  const { id } = await params;
  return <CorporateInquiryDetailClient inquiryId={id} />;
}
