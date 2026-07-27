import { AnalyticsClient } from "@/components/admin/AnalyticsClient";

/** `/admin/analytics` — GMV over time, orders by module, top sellers/products, new users, wallet flow. No chart library. */
export default function AdminAnalyticsPage() {
  return <AnalyticsClient />;
}
