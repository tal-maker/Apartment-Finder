// Optional: Claude reads free-text posts (Facebook/Telegram) and returns the same
// fields as the rule-based parser. Enabled when ANTHROPIC_API_KEY is set.
import Anthropic from '@anthropic-ai/sdk';
import { AREAS } from '../neighborhoods.js';
import { config } from '../config.js';

const nullable = (type, extra = {}) => ({ anyOf: [{ type, ...extra }, { type: 'null' }] });

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'kind', 'price', 'rooms', 'sizeSqm', 'floor', 'neighborhood', 'isTelAviv', 'street', 'houseNumber',
    'entryDate', 'condition', 'mamad', 'parking', 'storage', 'elevator', 'balcony', 'furnished', 'pets', 'broker',
  ],
  properties: {
    kind: { type: 'string', enum: ['rent', 'roommate', 'sublet', 'seeking', 'sale', 'other'] },
    price: nullable('integer'),
    rooms: nullable('number'),
    sizeSqm: nullable('integer'),
    floor: nullable('integer'),
    neighborhood: nullable('string'),
    isTelAviv: nullable('boolean'),
    street: nullable('string'),
    houseNumber: nullable('integer'),
    entryDate: nullable('string'),
    condition: nullable('string', { enum: ['new', 'renovated', 'good', 'needs_renovation'] }),
    mamad: nullable('boolean'),
    parking: nullable('boolean'),
    storage: nullable('boolean'),
    elevator: nullable('boolean'),
    balcony: nullable('boolean'),
    furnished: nullable('boolean'),
    pets: nullable('boolean'),
    broker: nullable('boolean'),
  },
};

const NEIGHBORHOOD_NAMES = AREAS.flatMap((a) => a.neighborhoods.map((n) => n.name)).join(', ');

const SYSTEM = `You extract structured data from Hebrew (sometimes English) apartment posts from Tel Aviv rental groups.
Return null for anything the post does not state; never guess.
- kind: "rent" for a whole apartment offered for long-term rent; "roommate" for a room in a shared apartment or a request for a roommate; "sublet" for short-term; "seeking" when the author is looking for an apartment; "sale" for sales; "other" otherwise.
- price: monthly rent in ILS for the whole offer (e.g. "6.5k" = 6500).
- neighborhood: if the location is in Tel Aviv-Yafo, pick the closest name from this list: ${NEIGHBORHOOD_NAMES}. Otherwise give the place as written.
- isTelAviv: false when the apartment is clearly in another city (Ramat Gan, Givatayim, Bat Yam...).
- entryDate: "immediate" for immediate entry, otherwise an ISO date (YYYY-MM-DD) relative to the post date.
- mamad: has a ממ"ד / protected room. broker: true if offered through a broker/agency (תיווך), false if explicitly without a broker or directly from the owner.`;

let client;

export function llmEnabled() {
  return config.llm.enabled;
}

export async function extractWithLlm(text, { postedAt } = {}) {
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: config.llm.model,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Post date: ${(postedAt ? new Date(postedAt) : new Date()).toISOString().slice(0, 10)}\n\n<post>\n${text}\n</post>`,
      },
    ],
  });
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
  const block = response.content.find((b) => b.type === 'text');
  if (!block) return null;
  const data = JSON.parse(block.text);
  const { isTelAviv, ...fields } = data;
  return { ...fields, isTelAviv };
}
