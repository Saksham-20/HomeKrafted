import { PromoBand } from "homekrafted-web";

/** The dark band — pine gradient, gold accent. */
export const Dark = () => (
  <div style={{ width: 560 }}>
    <PromoBand
      variant="dark"
      eyebrow="Gift hampers"
      title="One box, three kitchens"
      description="Assembled and priced by the makers themselves — not a builder you have to fill."
      ctaLabel="Browse hampers"
      ctaHref="#"
    />
  </div>
);

/** The tint band — gold wash, for the wallet. */
export const Tint = () => (
  <div style={{ width: 560 }}>
    <PromoBand
      variant="tint"
      eyebrow="Wallet"
      title="Pay from your balance"
      description="Top up once and every order settles from it, cashback included."
      ctaLabel="Open wallet"
      ctaHref="#"
    />
  </div>
);
