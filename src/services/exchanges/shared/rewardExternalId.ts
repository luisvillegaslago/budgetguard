/**
 * ExternalID of the Binance reward endpoints (Simple Earn flexible and locked,
 * ETH staking, on-chain staking interest), which return no id of their own.
 *
 * Built only from fields of the record, never its position in the page, so the
 * same reward keeps its id whichever window or page it comes back in and the
 * UNIQUE(UserID, EventType, ExternalID) constraint absorbs overlapping syncs.
 *
 * Shared by the API client, which stamps the id on every fetched reward, and by
 * the raw-event repository, which recomputes it from the payload of rows stored
 * under an earlier position-based id (`<projectId>-<time>-<asset>-<idx>` and
 * similar). Those ids are never produced again, so the constraint alone would
 * let a re-sync store each of those rewards a second time.
 */
import { CRYPTO_EVENT_TYPE } from '@/constants/finance';
import { hashRow } from './externalId';

interface RewardIdSpec {
  prefix: string;
  fields: readonly string[];
}

// The prefixes namespace the ids per endpoint. ETH staking has no position id
// and no type; `status`, `distributeAmount` and `conversionRatio` are left out
// because they can change after the record first appears (PENDING → SUCCESS).
// Changing the fields of a spec means changing its prefix as well: an id is
// taken as current by its shape (CURRENT_REWARD_ID_PATTERN), so rows stored
// under the old hash would otherwise never be recognised when the API sends
// them again under the new one.
const REWARD_ID_SPEC = {
  [CRYPTO_EVENT_TYPE.EARN_FLEX]: { prefix: 'earn-flex', fields: ['projectId', 'asset', 'time', 'type', 'rewards'] },
  [CRYPTO_EVENT_TYPE.EARN_LOCKED]: {
    prefix: 'earn-locked',
    fields: ['positionId', 'asset', 'time', 'type', 'amount'],
  },
  [CRYPTO_EVENT_TYPE.ETH_STAKING]: { prefix: 'eth-staking', fields: ['asset', 'time', 'amount'] },
  [CRYPTO_EVENT_TYPE.STAKING_INTEREST]: {
    prefix: 'staking-interest',
    fields: ['positionId', 'asset', 'time', 'type', 'amount'],
  },
} as const;

export type RewardEventType = keyof typeof REWARD_ID_SPEC;

/** Event types whose ExternalID is built here. */
export const REWARD_ID_EVENT_TYPES: readonly string[] = Object.keys(REWARD_ID_SPEC);

const REWARD_ID_EVENT_TYPE_SET = new Set<string>(REWARD_ID_EVENT_TYPES);

export function isRewardEventType(eventType: string): eventType is RewardEventType {
  return REWARD_ID_EVENT_TYPE_SET.has(eventType);
}

export function rewardExternalId(eventType: RewardEventType, record: Record<string, unknown>): string {
  const { prefix, fields }: RewardIdSpec = REWARD_ID_SPEC[eventType];
  return hashRow(prefix, ...fields.map((field) => (record[field] == null ? '' : String(record[field]))));
}

// Hex digits hashRow keeps of the SHA-256 digest.
const REWARD_ID_HASH_HEX_DIGITS = 16;

/**
 * Regular expression, valid in JavaScript and in PostgreSQL's `~`, matching
 * `<EventType>:<ExternalID>` when the ExternalID already has the shape
 * rewardExternalId gives that type today. Only a reward that does not match
 * can be stored under an earlier id, so the raw-event repository reads back
 * the payload of those rows alone to recompute their current id.
 */
export const CURRENT_REWARD_ID_PATTERN = `^(${Object.entries(REWARD_ID_SPEC)
  .map(([eventType, { prefix }]) => `${eventType}:${prefix}`)
  .join('|')})-[0-9a-f]{${REWARD_ID_HASH_HEX_DIGITS}}$`;
