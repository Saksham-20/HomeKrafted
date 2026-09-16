import { AttributeKind, AttributeRequirement } from '@prisma/client';
import {
  AttributeSpec,
  hasMaterialAttributeChange,
  inheritedSpecs,
  isAnswered,
  validateAttributeValues,
} from '../../src/catalog/attribute-values';

const spec = (over: Partial<AttributeSpec> = {}): AttributeSpec => ({
  key: 'metal',
  label: 'Metal or base',
  kind: AttributeKind.single,
  requirement: AttributeRequirement.optional,
  trustSensitive: false,
  material: false,
  optionValues: ['brass', 'copper', 'silver_925'],
  ...over,
});

describe('validateAttributeValues', () => {
  it('accepts a known option and normalises it into rows', () => {
    const { problems, answers } = validateAttributeValues([spec()], [{ key: 'metal', value: 'brass' }]);
    expect(problems).toEqual([]);
    expect(answers).toEqual([
      { key: 'metal', optionValues: ['brass'], text: null, number: null, boolean: null },
    ]);
  });

  it('refuses a value that is not one of the shelf’s choices, and names it', () => {
    const { problems } = validateAttributeValues([spec()], [{ key: 'metal', value: 'platinum' }]);
    expect(problems).toEqual([
      { field: 'metal', message: '"platinum" is not one of the choices for Metal or base.' },
    ]);
  });

  it('refuses a missing required answer and says which question', () => {
    const { problems } = validateAttributeValues(
      [spec({ requirement: AttributeRequirement.required })],
      [],
    );
    expect(problems).toEqual([
      { field: 'metal', message: 'Metal or base is needed before this can be saved.' },
    ]);
  });

  it('lets an encouraged question go unanswered — a nag is not a refusal', () => {
    const { problems, answers } = validateAttributeValues(
      [spec({ requirement: AttributeRequirement.encouraged })],
      [],
    );
    expect(problems).toEqual([]);
    expect(answers).toEqual([]);
  });

  it('drops an answer to a question this shelf does not ask, rather than refusing it', () => {
    // Moving a listing from Candles to Home Décor must not meet a wall of
    // errors about burn time.
    const { problems, answers } = validateAttributeValues(
      [spec()],
      [{ key: 'metal', value: 'brass' }, { key: 'burn_time_hours', number: 40 }],
    );
    expect(problems).toEqual([]);
    expect(answers.map((a) => a.key)).toEqual(['metal']);
  });

  it('keeps one value for a single-choice question however many arrive', () => {
    const { answers } = validateAttributeValues(
      [spec()],
      [{ key: 'metal', values: ['brass', 'copper'] }],
    );
    expect(answers[0].optionValues).toEqual(['brass']);
  });

  it('de-duplicates a multi-choice answer', () => {
    const recipients = spec({
      key: 'recipient',
      label: 'Who is it for?',
      kind: AttributeKind.multi,
      optionValues: ['her', 'him', 'kids'],
    });
    const { answers } = validateAttributeValues(
      [recipients],
      [{ key: 'recipient', values: ['her', 'kids', 'her'] }],
    );
    expect(answers[0].optionValues).toEqual(['her', 'kids']);
  });

  it('refuses a negative number', () => {
    const burn = spec({ key: 'burn_time_hours', label: 'Burn time', kind: AttributeKind.number, optionValues: [] });
    expect(validateAttributeValues([burn], [{ key: 'burn_time_hours', number: -4 }]).problems).toEqual([
      { field: 'burn_time_hours', message: 'Burn time cannot be negative.' },
    ]);
    expect(validateAttributeValues([burn], [{ key: 'burn_time_hours', number: 40 }]).problems).toEqual([]);
  });

  it('treats a required number of 0 as answered, not as missing', () => {
    // The `parseStock` lesson: a typed zero is a real answer, and reading
    // it as "blank" is what took sixteen live listings off sale.
    const stems = spec({
      key: 'flower_stem_count',
      label: 'Stems',
      kind: AttributeKind.number,
      requirement: AttributeRequirement.required,
      optionValues: [],
    });
    expect(validateAttributeValues([stems], [{ key: 'flower_stem_count', number: 0 }]).problems).toEqual([]);
  });

  it('treats a required "no" as answered, not as missing', () => {
    // Same shape for a boolean: `false` is what somebody chose. A shelf
    // that required "has small parts" must accept "no" as the answer.
    const smallParts = spec({
      key: 'toy_small_parts',
      label: 'Has small parts',
      kind: AttributeKind.boolean,
      requirement: AttributeRequirement.required,
      trustSensitive: true,
      optionValues: [],
    });
    expect(validateAttributeValues([smallParts], [{ key: 'toy_small_parts', boolean: false }]).problems).toEqual([]);
  });

  it('reads whitespace as no answer at all', () => {
    const notes = spec({ key: 'scent_notes', label: 'Scent notes', kind: AttributeKind.text, optionValues: [] });
    const { answers } = validateAttributeValues([notes], [{ key: 'scent_notes', text: '   ' }]);
    expect(answers).toEqual([]);
  });
});

describe('isAnswered', () => {
  it('reads an empty multi-select as "we were not told", never as "none of them"', () => {
    expect(
      isAnswered({ key: 'recipient', optionValues: [], text: null, number: null, boolean: null }),
    ).toBe(false);
  });
});

describe('hasMaterialAttributeChange', () => {
  const material = spec({ material: true });
  const colour = spec({ key: 'colour', kind: AttributeKind.multi, optionValues: ['red', 'blue'] });
  const answer = (key: string, values: string[]) => ({
    key,
    optionValues: values,
    text: null,
    number: null,
    boolean: null,
  });

  it('is true when a material answer changes', () => {
    expect(
      hasMaterialAttributeChange([material], [answer('metal', ['brass'])], [answer('metal', ['copper'])]),
    ).toBe(true);
  });

  it('is false when only a non-material answer changes — a colour swatch does not take a listing off sale', () => {
    expect(
      hasMaterialAttributeChange(
        [material, colour],
        [answer('metal', ['brass']), answer('colour', ['red'])],
        [answer('metal', ['brass']), answer('colour', ['blue'])],
      ),
    ).toBe(false);
  });

  it('is false when a multi answer is only re-ordered', () => {
    const multi = spec({ key: 'craft', kind: AttributeKind.multi, material: true, optionValues: ['resin', 'crochet'] });
    expect(
      hasMaterialAttributeChange(
        [multi],
        [answer('craft', ['resin', 'crochet'])],
        [answer('craft', ['crochet', 'resin'])],
      ),
    ).toBe(false);
  });

  it('is true when a material answer is removed altogether', () => {
    expect(hasMaterialAttributeChange([material], [answer('metal', ['brass'])], [])).toBe(true);
  });
});

describe('inheritedSpecs', () => {
  it('adds the parent’s questions to the child’s', () => {
    const own = spec({ key: 'earring_closure' });
    const parent = spec({ key: 'recipient' });
    expect(inheritedSpecs([own], [parent]).map((s) => s.key)).toEqual(['earring_closure', 'recipient']);
  });

  it('lets a child override a question its parent asks, without asking it twice', () => {
    const own = spec({ key: 'metal', requirement: AttributeRequirement.required });
    const parent = spec({ key: 'metal', requirement: AttributeRequirement.optional });
    const merged = inheritedSpecs([own], [parent]);
    expect(merged).toHaveLength(1);
    expect(merged[0].requirement).toBe(AttributeRequirement.required);
  });
});
