import {
  toSellerListingInput,
  type ListingFormValues,
  EMPTY_LISTING_FORM,
} from "./listing-input";

describe("toSellerListingInput", () => {
  it("merges size and colour into label when both are present", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Handmade Candle",
      categoryId: "cat-1",
      description: "A lovely scented candle.",
      kind: "craft",
      weightRows: [
        {
          label: "Small",
          colour: "Rose gold",
          price: "249",
          mrp: "299",
          stock: "10",
        },
      ],
    };

    const input = toSellerListingInput(values);
    expect(input.weightOptions).toHaveLength(1);
    expect(input.weightOptions[0].label).toBe("Small · Rose gold");
    expect(input.weightOptions[0].sku).toBe("handmade-candle-small-rose-gold");
    expect(input.defaultWeightSku).toBe("handmade-candle-small-rose-gold");
  });

  it("handles colour-only and size-only variants correctly", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Ceramic Mug",
      categoryId: "cat-1",
      description: "Hand-thrown mug.",
      kind: "craft",
      weightRows: [
        {
          label: "",
          colour: "Sky Blue",
          price: "350",
          mrp: "400",
          stock: "5",
        },
        {
          label: "Large",
          colour: "",
          price: "450",
          mrp: "500",
          stock: "8",
        },
      ],
      defaultRowIndex: 1,
    };

    const input = toSellerListingInput(values);
    expect(input.weightOptions).toHaveLength(2);
    expect(input.weightOptions[0].label).toBe("Sky Blue");
    expect(input.weightOptions[0].sku).toBe("ceramic-mug-sky-blue");
    expect(input.weightOptions[1].label).toBe("Large");
    expect(input.weightOptions[1].sku).toBe("ceramic-mug-large");
    expect(input.defaultWeightSku).toBe("ceramic-mug-large");
  });

  it("supports multiple size tiers with prices and stocks", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Mango Pickle",
      categoryId: "cat-food",
      description: "Homemade sour mango pickle.",
      kind: "food",
      weightRows: [
        { label: "250 g", price: "180", mrp: "200", stock: "15" },
        { label: "500 g", price: "320", mrp: "350", stock: "10" },
        { label: "1 kg", price: "600", mrp: "650", stock: "5" },
      ],
      defaultRowIndex: 0,
    };

    const input = toSellerListingInput(values);
    expect(input.weightOptions).toHaveLength(3);
    expect(input.weightOptions[0].label).toBe("250 g");
    expect(input.weightOptions[0].price).toBe(180);
    expect(input.weightOptions[1].label).toBe("500 g");
    expect(input.weightOptions[1].price).toBe(320);
    expect(input.weightOptions[2].label).toBe("1 kg");
    expect(input.weightOptions[2].price).toBe(600);
    expect(input.defaultWeightSku).toBe(input.weightOptions[0].sku);
  });
});
