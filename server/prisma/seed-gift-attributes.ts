/**
 * G1 — what each gift shelf asks (docs/GIFTING-REWORK.md §3.2, §3.3).
 *
 * **This is seed data, not code, and that is the whole point.** Until now
 * "what the form asks" lived in `client/lib/sell/listing-families.ts` as a
 * hardcoded slug map, so adding a question to a shelf meant a deploy — and
 * the map had already drifted from the database, leaving thirty live bangle
 * listings asked the generic question set. An admin adds "Burn time" to a
 * new subcategory here or on the admin screen, and the listing form, the
 * filters, the product specs and a later suggestion all read the same rows.
 *
 * **Additive and idempotent**, like every seed in this directory: an
 * attribute is matched on its stable `key`, an option on `[attribute,
 * value]`, and a shelf's link on `[categoryId, attributeId]`. Nothing is
 * renamed, nothing is deleted, and re-running changes nothing. Labels are
 * only filled where blank, so an admin's rename survives the next run.
 *
 * Two flags carry rules rather than data:
 *
 * - **`trustSensitive` is never filled in by a machine** (§8.2). Allergens,
 *   "nickel-free", vegan, shelf life, age suitability, a small-parts
 *   warning, 925 silver. A wrong guess on one of these is not a tidy-up
 *   somebody corrects later — it is the platform making a safety claim on a
 *   maker's behalf. Pinned by a structural spec.
 * - **`material` means M22's "material change"**: editing this answer on a
 *   live listing re-queues it. Most attributes are not — switching a colour
 *   swatch must not take a listing off sale.
 *
 * A required attribute must be refusable *and* reachable on the form
 * (`listing-families.spec.ts`'s lesson), which is why `required` is spent
 * sparingly here and the server validates it (`attribute-values.ts`).
 *
 *   npx ts-node prisma/seed-gift-attributes.ts
 */
import {
  AttributeKind,
  AttributeRequirement,
  PrismaClient,
  ProductKind,
} from '@prisma/client';
import { findSameName } from '../src/common/fold-name';

const prisma = new PrismaClient();

interface OptionSeed {
  value: string;
  label: string;
  synonyms?: string[];
  hex?: string;
}

interface AttributeSeed {
  key: string;
  label: string;
  helpText?: string;
  kind: AttributeKind;
  unit?: string;
  filterable?: boolean;
  trustSensitive?: boolean;
  material?: boolean;
  options?: OptionSeed[];
}

const opt = (value: string, label: string, synonyms?: string[]): OptionSeed => ({
  value,
  label,
  synonyms,
});

/** Asked of every gift, whatever the department (§3.3's first paragraph). */
const GLOBAL: AttributeSeed[] = [
  {
    key: 'recipient',
    label: 'Who is it for?',
    helpText: 'Pick every one it suits — this is how buyers filter, and most gifts suit several.',
    kind: AttributeKind.multi,
    filterable: true,
    options: [
      opt('her', 'Her'),
      opt('him', 'Him'),
      opt('couple', 'A couple'),
      opt('parents', 'Parents'),
      opt('kids', 'Kids'),
      opt('baby', 'A baby'),
      opt('friend', 'A friend'),
      opt('colleague', 'A colleague'),
      opt('teacher', 'A teacher'),
      opt('sibling', 'A sibling', ['brother', 'sister']),
      opt('grandparents', 'Grandparents'),
      opt('host', 'A host', ['housewarming']),
    ],
  },
  {
    key: 'craft',
    label: 'Craft or artform',
    helpText: 'How it is made. Buyers search for these by name.',
    kind: AttributeKind.multi,
    filterable: true,
    options: [
      opt('crochet', 'Crochet'),
      opt('macrame', 'Macramé'),
      opt('mirror_work', 'Mirror work', ['sheesha']),
      opt('kundan', 'Kundan'),
      opt('block_print', 'Block print'),
      opt('madhubani', 'Madhubani'),
      opt('pichwai', 'Pichwai'),
      opt('warli', 'Warli'),
      opt('gond', 'Gond'),
      opt('lippan', 'Lippan'),
      opt('resin', 'Resin'),
      opt('pottery', 'Pottery', ['ceramic', 'terracotta']),
      opt('embroidery', 'Embroidery'),
      opt('handloom', 'Handloom', ['weaving']),
      opt('beadwork', 'Beadwork'),
    ],
  },
  {
    key: 'colour',
    label: 'Colours',
    helpText: 'The colours a buyer would say it is. Swatches, not typed names.',
    kind: AttributeKind.multi,
    filterable: true,
    options: [
      { value: 'red', label: 'Red', hex: '#B3261E' },
      { value: 'pink', label: 'Pink', hex: '#D96A8E' },
      { value: 'orange', label: 'Orange', hex: '#D97706' },
      { value: 'yellow', label: 'Yellow', hex: '#E0B341' },
      { value: 'green', label: 'Green', hex: '#3C6B47' },
      { value: 'blue', label: 'Blue', hex: '#2F5D8C' },
      { value: 'purple', label: 'Purple', hex: '#6B4A86' },
      { value: 'brown', label: 'Brown', hex: '#7A5230' },
      { value: 'black', label: 'Black', hex: '#1F1B16' },
      { value: 'white', label: 'White', hex: '#F7F4EE' },
      { value: 'grey', label: 'Grey', hex: '#8A8580' },
      { value: 'gold', label: 'Gold', hex: '#B98724' },
      { value: 'silver', label: 'Silver', hex: '#B9BCC0' },
      { value: 'multicolour', label: 'Multicolour' },
    ],
  },
];

interface DepartmentAttributes {
  /** Matched with case and accents folded; the shelf it becomes counts too. */
  department: string;
  formerly?: string[];
  attributes: (AttributeSeed & { requirement: AttributeRequirement })[];
}

const required = AttributeRequirement.required;
const encouraged = AttributeRequirement.encouraged;
const optional = AttributeRequirement.optional;

const BY_DEPARTMENT: DepartmentAttributes[] = [
  {
    department: 'Jewellery & Accessories',
    formerly: ['Handmade Jewellery'],
    attributes: [
      {
        key: 'jewellery_metal',
        label: 'Metal or base',
        kind: AttributeKind.single,
        filterable: true,
        material: true,
        requirement: required,
        options: [
          opt('brass', 'Brass'),
          opt('copper', 'Copper'),
          opt('oxidised', 'Oxidised metal', ['german silver']),
          opt('gold_plated', 'Gold-plated'),
          opt('alloy', 'Alloy'),
          opt('thread_fabric', 'Thread or fabric'),
          opt('beads', 'Beads'),
          opt('terracotta', 'Terracotta'),
          opt('resin', 'Resin'),
          // The one hallmark-backed claim in the list, so it is the one
          // nothing may ever guess on a maker's behalf.
          opt('silver_925', '925 silver'),
        ],
      },
      {
        key: 'jewellery_silver_925',
        label: 'Is this hallmarked 925 silver?',
        helpText: 'Only tick this if it is hallmarked. It is a claim about the metal, not a description of the colour.',
        kind: AttributeKind.boolean,
        trustSensitive: true,
        requirement: optional,
      },
      {
        key: 'jewellery_stone',
        label: 'Stone or embellishment',
        kind: AttributeKind.single,
        filterable: true,
        requirement: encouraged,
        options: [
          opt('none', 'None'),
          opt('kundan', 'Kundan'),
          opt('pearl', 'Pearl'),
          opt('mirror', 'Mirror'),
          opt('cz', 'Cubic zirconia', ['cz', 'american diamond']),
          opt('semi_precious', 'Semi-precious stone'),
        ],
      },
      {
        key: 'earring_closure',
        label: 'Earring closure',
        kind: AttributeKind.single,
        filterable: true,
        requirement: optional,
        options: [
          opt('hook', 'Hook'),
          opt('stud', 'Stud'),
          opt('clip_on', 'Clip-on'),
          opt('leverback', 'Leverback'),
          opt('hoop', 'Hoop'),
        ],
      },
      {
        key: 'jewellery_size',
        label: 'Size, or adjustable',
        helpText: 'Ring or bangle size, necklace length — or say it adjusts.',
        kind: AttributeKind.text,
        requirement: encouraged,
      },
      {
        key: 'jewellery_nickel_free',
        label: 'Nickel-free',
        helpText: 'Your own declaration about what you used. Shown to buyers as your claim, in your name.',
        kind: AttributeKind.boolean,
        trustSensitive: true,
        requirement: optional,
      },
    ],
  },
  {
    department: 'Candles & Lighting',
    formerly: ['Candles & Home'],
    attributes: [
      {
        key: 'candle_type',
        label: 'Candle type',
        kind: AttributeKind.single,
        filterable: true,
        material: true,
        requirement: required,
        options: [
          opt('jar', 'Jar'),
          opt('pillar', 'Pillar'),
          opt('shaped', 'Shaped'),
          opt('tealight', 'Tealight'),
          opt('floating', 'Floating'),
        ],
      },
      {
        key: 'candle_wax',
        label: 'Wax',
        kind: AttributeKind.single,
        filterable: true,
        requirement: required,
        options: [
          opt('soy', 'Soy'),
          opt('beeswax', 'Beeswax'),
          opt('coconut_blend', 'Coconut blend'),
          opt('paraffin', 'Paraffin'),
          opt('gel', 'Gel'),
        ],
      },
      {
        key: 'scent_family',
        label: 'Scent family',
        kind: AttributeKind.single,
        filterable: true,
        requirement: encouraged,
        options: [
          opt('floral', 'Floral'),
          opt('woody', 'Woody'),
          opt('citrus', 'Citrus'),
          opt('fresh', 'Fresh'),
          opt('gourmand', 'Gourmand', ['sweet', 'vanilla']),
          opt('spicy', 'Spicy'),
          opt('unscented', 'Unscented'),
        ],
      },
      {
        key: 'scent_notes',
        label: 'Scent notes',
        helpText: 'In your words — "chai, cardamom, warm milk".',
        kind: AttributeKind.text,
        requirement: optional,
      },
      {
        key: 'burn_time_hours',
        label: 'Burn time',
        kind: AttributeKind.number,
        unit: 'hours',
        filterable: true,
        requirement: encouraged,
      },
      {
        key: 'candle_vessel',
        label: 'Vessel',
        kind: AttributeKind.single,
        filterable: true,
        requirement: optional,
        options: [
          opt('glass', 'Glass'),
          opt('ceramic', 'Ceramic'),
          opt('tin', 'Tin'),
          opt('terracotta', 'Terracotta'),
          opt('concrete', 'Concrete'),
          opt('none', 'No vessel'),
        ],
      },
    ],
  },
  {
    department: 'Wall Art',
    formerly: ['Art & Prints'],
    attributes: [
      {
        key: 'art_medium',
        label: 'Medium',
        kind: AttributeKind.single,
        filterable: true,
        material: true,
        requirement: required,
        options: [
          opt('acrylic', 'Acrylic'),
          opt('oil', 'Oil'),
          opt('watercolour', 'Watercolour'),
          opt('gouache', 'Gouache'),
          opt('mixed', 'Mixed media'),
          opt('digital', 'Digital'),
        ],
      },
      {
        key: 'art_edition',
        label: 'Original or print',
        helpText: 'What the buyer receives. An original is one of one.',
        kind: AttributeKind.single,
        filterable: true,
        material: true,
        requirement: required,
        options: [
          opt('original', 'Original'),
          opt('limited_print', 'Limited print'),
          opt('open_print', 'Open print'),
        ],
      },
      {
        key: 'art_framing',
        label: 'Framing',
        kind: AttributeKind.single,
        filterable: true,
        requirement: encouraged,
        options: [
          opt('framed', 'Framed'),
          opt('unframed', 'Unframed'),
          opt('ready_to_hang', 'Ready to hang'),
        ],
      },
      {
        key: 'art_subject',
        label: 'Subject',
        kind: AttributeKind.text,
        requirement: optional,
      },
    ],
  },
  {
    department: 'Home Décor',
    attributes: [
      {
        key: 'decor_technique',
        label: 'Technique',
        kind: AttributeKind.single,
        filterable: true,
        requirement: encouraged,
        options: [
          opt('resin', 'Resin'),
          opt('pottery', 'Pottery'),
          opt('macrame', 'Macramé'),
          opt('woodwork', 'Woodwork'),
          opt('metalwork', 'Metalwork'),
          opt('painted', 'Hand-painted'),
        ],
      },
      {
        key: 'decor_room',
        label: 'Room',
        kind: AttributeKind.multi,
        filterable: true,
        requirement: optional,
        options: [
          opt('living', 'Living room'),
          opt('bedroom', 'Bedroom'),
          opt('kitchen', 'Kitchen'),
          opt('entryway', 'Entryway'),
          opt('pooja', 'Pooja room', ['puja']),
          opt('outdoor', 'Outdoor'),
        ],
      },
    ],
  },
  {
    department: 'Bath & Self-care',
    formerly: ['Self-Care'],
    attributes: [
      {
        key: 'selfcare_form',
        label: 'Form',
        kind: AttributeKind.single,
        filterable: true,
        material: true,
        requirement: required,
        options: [
          opt('bar', 'Bar'),
          opt('liquid', 'Liquid'),
          opt('oil', 'Oil'),
          opt('balm', 'Balm'),
          opt('powder', 'Powder'),
          opt('mask', 'Mask'),
        ],
      },
      {
        key: 'selfcare_key_ingredients',
        label: 'Key ingredients',
        helpText: 'What it is made of, in the order it is made of it.',
        kind: AttributeKind.text,
        trustSensitive: true,
        requirement: required,
      },
      {
        key: 'selfcare_skin_type',
        label: 'Skin type',
        kind: AttributeKind.multi,
        filterable: true,
        requirement: encouraged,
        options: [
          opt('all', 'All skin'),
          opt('dry', 'Dry'),
          opt('oily', 'Oily'),
          opt('combination', 'Combination'),
          opt('sensitive', 'Sensitive'),
        ],
      },
      {
        key: 'selfcare_method',
        label: 'How it is made',
        kind: AttributeKind.single,
        requirement: optional,
        options: [opt('cold_process', 'Cold process'), opt('melt_and_pour', 'Melt & pour')],
      },
      {
        key: 'selfcare_vegan',
        label: 'Vegan',
        helpText: 'Your own declaration. Shown as your claim, in your name.',
        kind: AttributeKind.boolean,
        trustSensitive: true,
        requirement: optional,
      },
    ],
  },
  {
    department: 'Kids & Soft Toys',
    attributes: [
      {
        key: 'toy_age',
        label: 'Suitable from',
        helpText: 'Be honest about the youngest age this is safe for. Nothing fills this in for you.',
        kind: AttributeKind.single,
        filterable: true,
        trustSensitive: true,
        material: true,
        requirement: required,
        options: [
          opt('0_plus', 'Newborn and up'),
          opt('18m_plus', '18 months and up'),
          opt('3_plus', '3 years and up'),
          opt('8_plus', '8 years and up'),
        ],
      },
      {
        key: 'toy_fill',
        label: 'Material and fill',
        kind: AttributeKind.text,
        filterable: false,
        requirement: required,
      },
      {
        key: 'toy_small_parts',
        label: 'Has small parts',
        helpText: 'Buttons, beads, eyes that could come loose. This becomes a warning on the listing.',
        kind: AttributeKind.boolean,
        trustSensitive: true,
        requirement: required,
      },
      {
        key: 'toy_washable',
        label: 'Washable',
        kind: AttributeKind.single,
        requirement: optional,
        options: [
          opt('machine', 'Machine washable'),
          opt('hand', 'Hand wash'),
          opt('spot', 'Spot clean only'),
        ],
      },
    ],
  },
  {
    department: 'Flowers & Plants',
    attributes: [
      {
        key: 'flower_type',
        label: 'Type',
        kind: AttributeKind.single,
        filterable: true,
        material: true,
        requirement: required,
        options: [
          opt('crochet', 'Crochet'),
          opt('wax', 'Wax'),
          opt('dried', 'Dried'),
          opt('preserved', 'Preserved'),
          opt('plant', 'Live plant'),
        ],
      },
      {
        key: 'flower_stem_count',
        label: 'Stems',
        kind: AttributeKind.number,
        unit: 'stems',
        requirement: optional,
      },
      {
        key: 'flower_vase_included',
        label: 'Vase included',
        kind: AttributeKind.boolean,
        requirement: optional,
      },
    ],
  },
  {
    department: 'Hampers & Gift Sets',
    attributes: [
      {
        key: 'hamper_contents',
        label: "What's in it",
        helpText: 'Everything inside, with quantities. If any of it is edible, the food questions apply to the hamper too.',
        kind: AttributeKind.text,
        material: true,
        requirement: required,
      },
      {
        key: 'hamper_packaging',
        label: 'Packaging',
        kind: AttributeKind.single,
        filterable: true,
        requirement: encouraged,
        options: [
          opt('box', 'Box'),
          opt('basket', 'Basket'),
          opt('tray', 'Tray'),
          opt('bag', 'Bag'),
        ],
      },
      {
        key: 'hamper_customisable',
        label: 'Contents can be swapped',
        kind: AttributeKind.boolean,
        requirement: optional,
      },
    ],
  },
  {
    /**
     * D10. These are the food questions, asked on the gifts side, because
     * the owner kept chocolates here rather than taking fourteen live
     * listings off sale. The veg mark itself stays on `Product.dietary`
     * and is read through `dietOf` — it is not duplicated as an attribute,
     * or the mark and the filter would have two sources of truth.
     */
    department: 'Chocolates & Edible Gifts',
    attributes: [
      {
        key: 'edible_shelf_life_days',
        label: 'Best within',
        helpText: 'How many days after you make it. Nothing guesses this.',
        kind: AttributeKind.number,
        unit: 'days',
        filterable: true,
        trustSensitive: true,
        material: true,
        requirement: required,
      },
      {
        key: 'edible_storage',
        label: 'How to keep it',
        kind: AttributeKind.single,
        filterable: true,
        requirement: required,
        options: [
          opt('room', 'Room temperature'),
          opt('cool_dry', 'Cool and dry'),
          opt('refrigerated', 'Refrigerated'),
        ],
      },
      {
        key: 'edible_heat_sensitive',
        label: 'Melts in transit without cold packing',
        helpText: 'Chocolate usually does. This is what decides whether a courier may carry it at all.',
        kind: AttributeKind.boolean,
        trustSensitive: true,
        requirement: required,
      },
      {
        key: 'edible_pack_size',
        label: 'Pieces in a pack',
        kind: AttributeKind.number,
        unit: 'pieces',
        filterable: true,
        requirement: encouraged,
      },
    ],
  },
  {
    department: 'Kitchen & Dining',
    attributes: [
      {
        key: 'tableware_food_safe',
        label: 'Food-safe glaze',
        helpText: 'Your own declaration about the glaze you used.',
        kind: AttributeKind.boolean,
        trustSensitive: true,
        requirement: encouraged,
      },
      {
        key: 'tableware_care',
        label: 'Dishwasher and microwave',
        kind: AttributeKind.single,
        filterable: true,
        requirement: optional,
        options: [
          opt('both', 'Dishwasher and microwave safe'),
          opt('dishwasher', 'Dishwasher safe only'),
          opt('handwash', 'Hand wash only'),
        ],
      },
    ],
  },
];

async function ensureAttribute(seed: AttributeSeed) {
  const existing = await prisma.attributeDefinition.findUnique({ where: { key: seed.key } });
  const attribute =
    existing ??
    (await prisma.attributeDefinition.create({
      data: {
        key: seed.key,
        label: seed.label,
        helpText: seed.helpText,
        kind: seed.kind,
        unit: seed.unit,
        filterable: seed.filterable ?? false,
        trustSensitive: seed.trustSensitive ?? false,
        material: seed.material ?? false,
      },
    }));
  console.log(`${existing ? '=' : '+'} ${seed.key}`);

  for (const [index, option] of (seed.options ?? []).entries()) {
    const found = await prisma.attributeOption.findUnique({
      where: { attributeId_value: { attributeId: attribute.id, value: option.value } },
    });
    if (found) continue;
    await prisma.attributeOption.create({
      data: {
        attributeId: attribute.id,
        value: option.value,
        label: option.label,
        synonyms: option.synonyms ?? [],
        hex: option.hex,
        sortOrder: index + 1,
      },
    });
    console.log(`    + ${seed.key}.${option.value}`);
  }
  return attribute;
}

/** Every craft shelf this department covers: itself and its children. */
async function departmentAndChildren(names: string[]): Promise<{ id: string; name: string }[]> {
  const craft = await prisma.category.findMany({ where: { group: ProductKind.craft } });
  for (const name of names) {
    const row = findSameName(craft, name);
    if (!row) continue;
    const children = craft.filter((c) => c.parentId === row.id);
    return [row, ...children];
  }
  return [];
}

async function link(categoryId: string, attributeId: string, requirement: AttributeRequirement, sortOrder: number) {
  const existing = await prisma.categoryAttribute.findUnique({
    where: { categoryId_attributeId: { categoryId, attributeId } },
  });
  if (existing) return false;
  await prisma.categoryAttribute.create({
    data: { categoryId, attributeId, requirement, sortOrder },
  });
  return true;
}

async function main() {
  console.log('Global attributes (asked of every gift):');
  const globals = [];
  for (const seed of GLOBAL) globals.push(await ensureAttribute(seed));

  console.log('\nDepartment attributes:');
  let links = 0;
  for (const dept of BY_DEPARTMENT) {
    const shelves = await departmentAndChildren([dept.department, ...(dept.formerly ?? [])]);
    if (shelves.length === 0) {
      console.warn(`! "${dept.department}" is not in the catalogue — run seed-gift-taxonomy.ts first`);
      continue;
    }
    console.log(`\n${dept.department} (${shelves.length} shelves)`);

    // Global questions hang off the **department**, and children inherit —
    // one row per department rather than one per shelf, so an admin who
    // later drops "craft" from a department drops it from its children too.
    for (const [index, attribute] of globals.entries()) {
      if (await link(shelves[0].id, attribute.id, encouraged, index + 1)) links += 1;
    }

    for (const [index, seed] of dept.attributes.entries()) {
      const attribute = await ensureAttribute(seed);
      if (await link(shelves[0].id, attribute.id, seed.requirement, 100 + index)) links += 1;
    }
  }

  const [defs, options, wired] = await Promise.all([
    prisma.attributeDefinition.count(),
    prisma.attributeOption.count(),
    prisma.categoryAttribute.count(),
  ]);
  console.log(
    `\n${defs} attributes, ${options} options, ${wired} shelf links (${links} added this run).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
