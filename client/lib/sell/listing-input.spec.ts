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

  it("supports multiple colours separated by commas for a single size", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Handmade Candle",
      categoryId: "cat-1",
      description: "A scented candle available in several colours.",
      kind: "craft",
      weightRows: [
        {
          label: "Medium",
          colour: "Rose gold, Matte Black, Ivory",
          price: "349",
          mrp: "399",
          stock: "15",
        },
      ],
    };

    const input = toSellerListingInput(values);
    expect(input.weightOptions).toHaveLength(1);
    expect(input.weightOptions[0].label).toBe("Medium · Rose gold, Matte Black, Ivory");
    expect(input.weightOptions[0].sku).toBe("handmade-candle-medium-rose-gold-matte-black-ivory");
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

  it("passes dimensions, material, careInstructions through for craft listings", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Soy Candle",
      categoryId: "cat-craft",
      description: "Hand-poured soy wax candle.",
      kind: "craft",
      dimensions: "8 × 8 × 10 cm",
      material: "100% Soy Wax, Cotton wick",
      careInstructions: "Keep away from direct sunlight",
      weightRows: [{ label: "Standard", price: "399", mrp: "449", stock: "20" }],
    };

    const input = toSellerListingInput(values);
    expect(input.dimensions).toBe("8 × 8 × 10 cm");
    expect(input.material).toBe("100% Soy Wax, Cotton wick");
    expect(input.careInstructions).toBe("Keep away from direct sunlight");
  });

  it("supports dimensions and specs across food and craft listings alike", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Besan Ladoo Gift Box",
      categoryId: "cat-food",
      description: "Classic gram-flour sweets in handcrafted box.",
      kind: "food",
      dimensions: "20 × 15 × 5 cm",
      material: "Tin box with gold foil",
      careInstructions: "Store in a cool dry place",
      prepTimeMins: "120",
      weightRows: [{ label: "Box of 12", price: "250", mrp: "280", stock: "30" }],
    };

    const input = toSellerListingInput(values);
    expect(input.dimensions).toBe("20 × 15 × 5 cm");
    expect(input.material).toBe("Tin box with gold foil");
    expect(input.careInstructions).toBe("Store in a cool dry place");
    expect(input.prepTimeMins).toBe(120);
  });

  it("omits spec fields when empty strings are provided", () => {
    const values: ListingFormValues = {
      ...EMPTY_LISTING_FORM,
      name: "Plain Dish",
      categoryId: "cat-food",
      description: "Simple home cooked meal.",
      kind: "food",
      dimensions: "   ",
      material: "",
      careInstructions: "   ",
      weightRows: [{ label: "1 portion", price: "150", mrp: "180", stock: "10" }],
    };

    const input = toSellerListingInput(values);
    expect(input.dimensions).toBeUndefined();
    expect(input.material).toBeUndefined();
    expect(input.careInstructions).toBeUndefined();
  });
});
