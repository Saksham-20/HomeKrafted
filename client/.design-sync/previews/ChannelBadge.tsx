import { ChannelBadge } from "homekrafted-web";

/** One badge per channel in lib/channel.ts. */
export const AllChannels = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <ChannelBadge channel="marketplace" />
    <ChannelBadge channel="snacks" />
    <ChannelBadge channel="full-meals" />
  </div>
);
