import { PortalPageHeader, type PortalPageHeaderProps } from "@/components/portal/PortalPageHeader";

export type AdminPageHeaderProps = PortalPageHeaderProps;

/** The `/admin/*` page-title row — `PortalPageHeader` under its old name (2026-09-04); see `components/seller/SellerPageHeader.tsx`. */
export function AdminPageHeader(props: AdminPageHeaderProps) {
  return <PortalPageHeader {...props} />;
}
