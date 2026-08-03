import { pageMetadata } from "@/lib/seo";
import { ForgotPasswordClient } from "@/components/auth/ForgotPasswordClient";

export const metadata = pageMetadata({
  title: "Reset your password",
  description: "Send yourself a link to set a new Homekrafted password.",
  path: "/forgot-password",
  noindex: true,
});

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
