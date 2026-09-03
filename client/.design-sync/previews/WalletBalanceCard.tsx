import { WalletBalanceCard } from "homekrafted-web";

/** A wallet with money in it, cashback pending and a lifetime saved figure. */
export const Funded = () => (
  <div style={{ width: 360 }}>
    <WalletBalanceCard balance={1840} pendingCashback={62} lifetimeSaved={1275} />
  </div>
);

/** A wallet on day one — zeroes are a real state, not an empty card. */
export const Empty = () => (
  <div style={{ width: 360 }}>
    <WalletBalanceCard balance={0} pendingCashback={0} lifetimeSaved={0} />
  </div>
);
