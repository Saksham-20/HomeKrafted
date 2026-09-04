import { PortalPageHeader, type PortalPageHeaderProps } from "@/components/portal/PortalPageHeader";

export type SellerPageHeaderProps = PortalPageHeaderProps;

/** The `/seller/*` page-title row — `PortalPageHeader`, kept under its old name so forty call sites did not have to change (2026-09-04). */
export function SellerPageHeader(props: SellerPageHeaderProps) {
  return <PortalPageHeader {...props} />;
}
