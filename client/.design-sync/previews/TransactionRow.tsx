import { TransactionRow } from "homekrafted-web";
import { demoTransactions } from "../preview-lib/fixtures";

/** The wallet ledger — credits and debits as they actually arrive. */
export const Ledger = () => (
  <div style={{ width: 420, display: "grid" }}>
    {demoTransactions.map((t) => <TransactionRow key={t.id} transaction={t} />)}
  </div>
);
