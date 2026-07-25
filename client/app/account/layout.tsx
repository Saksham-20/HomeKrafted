import type { ReactNode } from "react";
import { AccountShell } from "@/components/account/AccountShell";

/**
 * `/account/*` layout (M7a) — wraps every account route in the shared
 * sidebar/tab-strip shell. See `AccountShell` for the responsive
 * behaviour and the signed-out gate.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
