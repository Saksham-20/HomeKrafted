import { WalletBalanceCard } from "homekrafted-web";

/** A wallet with money in it. */
export const Funded = () => (
  <div style={{ width: 360 }}>
    <WalletBalanceCard balance={1840} />
  </div>
);

/** A wallet on day one — zero is a real balance, not an empty card. */
export const Empty = () => (
  <div style={{ width: 360 }}>
    <WalletBalanceCard balance={0} />
  </div>
);
