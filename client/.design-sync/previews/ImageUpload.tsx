import { ImageUpload } from "homekrafted-web";

const frame: React.CSSProperties = { width: 320 };

/** Empty — drag, click or paste. This is the state a maker meets first. */
export const Empty = () => (
  <div style={frame}>
    <ImageUpload
      value=""
      onChange={() => {}}
      purpose="listing"
      label="Listing photo"
      hint="One clear photo of the thing you made. JPEG, PNG, WebP or AVIF, up to 12 MB."
      placeholderLabel="Mango Thokku Pickle — hero"
    />
  </div>
);

/** The avatar shape, for a storefront portrait. */
export const AvatarShape = () => (
  <div style={frame}>
    <ImageUpload
      value=""
      onChange={() => {}}
      purpose="storefront"
      shape="circle"
      ratio="1/1"
      label="Your photo"
      hint="A photo of you wins over a character — buyers are trusting a person."
      placeholderLabel="Maker portrait"
    />
  </div>
);

/** Disabled, while the form is saving. */
export const Disabled = () => (
  <div style={frame}>
    <ImageUpload value="" onChange={() => {}} purpose="listing" label="Listing photo" disabled />
  </div>
);
