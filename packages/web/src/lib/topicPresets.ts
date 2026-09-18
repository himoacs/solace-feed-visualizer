import type { TopicTaxonomyVariable } from '@feed-viz/shared';
import { DEFAULT_TAXONOMY_VARIABLES, extractVariables } from './topicTaxonomy';

export interface TopicPreset {
  id: string;
  theme: string;
  domain: string;
  useCase: string;
  /** Shown to the presenter once the preset is applied. */
  description: string;
  topicTemplate: string;
  /** Only the NEW variables this preset introduces - presets that reuse an
   * existing variable (e.g. market data's country/exchange/ticker) just
   * reference it by name in topicTemplate without redefining it, so applying
   * a preset never clobbers a variable another preset (or the presenter)
   * already edited. */
  variables: TopicTaxonomyVariable[];
}

// Sample "ID-like" properties (order/account/payment/batch numbers) are
// modeled as a curated sample set, same as the existing `ticker` variable -
// not a live generator. That matches the existing engine (no changes needed)
// and is more demo-friendly: an audience sees the same handful of IDs recur
// and can recognize a wildcard subscription actually matching them.
const ORDER_IDS = [
  'ORD-100234', 'ORD-100567', 'ORD-100812', 'ORD-101045', 'ORD-101298',
  'ORD-101533', 'ORD-101764', 'ORD-102001', 'ORD-102256', 'ORD-102489',
  'ORD-102715', 'ORD-102948', 'ORD-103172', 'ORD-103405', 'ORD-103638',
];

const LOAN_ACCOUNT_IDS = [
  'LN-0083492', 'LN-0091027', 'LN-0104558', 'LN-0117203', 'LN-0129841',
  'LN-0136477', 'LN-0148902', 'LN-0155319', 'LN-0163784', 'LN-0171256',
  'LN-0182904', 'LN-0194337', 'LN-0206871', 'LN-0219405', 'LN-0227938',
];

const PAYMENT_IDS = [
  'PMT-7720145', 'PMT-7734682', 'PMT-7748219', 'PMT-7761756', 'PMT-7775293',
  'PMT-7788830', 'PMT-7802367', 'PMT-7815904', 'PMT-7829441', 'PMT-7842978',
  'PMT-7856515', 'PMT-7870052', 'PMT-7883589', 'PMT-7897126', 'PMT-7910663',
];

const SETTLEMENT_BATCH_IDS = [
  'BATCH-33012', 'BATCH-33047', 'BATCH-33081', 'BATCH-33116', 'BATCH-33150',
  'BATCH-33185', 'BATCH-33219', 'BATCH-33254', 'BATCH-33288', 'BATCH-33323',
];

export const TOPIC_PRESETS: TopicPreset[] = [
  {
    id: 'fs-capital-markets-market-data',
    theme: 'Financial Services',
    domain: 'Capital Markets',
    useCase: 'Market Data Distribution',
    description: 'Real-time price quotes across exchanges - reuses the existing country/exchange/ticker chain.',
    topicTemplate: 'capitalMarkets/marketData/quote/updated/v1/{country}/{exchange}/{ticker}',
    variables: [],
  },
  {
    id: 'fs-capital-markets-trade-order',
    theme: 'Financial Services',
    domain: 'Capital Markets',
    useCase: 'Trade Order Distribution',
    description: 'Order lifecycle events (submitted, executed, cancelled, ...) across asset classes and exchanges.',
    topicTemplate: 'capitalMarkets/tradeOrder/order/{orderEventType}/v1/{assetClass}/{exchange}/{orderId}',
    variables: [
      {
        name: 'orderEventType',
        description: 'Trade order lifecycle event',
        values: ['submitted', 'executed', 'cancelled', 'rejected', 'partiallyFilled'],
        isCustom: false,
      },
      {
        name: 'assetClass',
        description: 'Asset class being traded',
        values: ['equity', 'fixedIncome', 'fx', 'commodity', 'derivative'],
        isCustom: false,
      },
      {
        name: 'orderId',
        description: 'Trade order identifier',
        values: ORDER_IDS,
        isCustom: false,
      },
    ],
  },
  {
    id: 'fs-retail-banking-loan-servicing',
    theme: 'Financial Services',
    domain: 'Retail Consumer Banking',
    useCase: 'Loan Servicing',
    description: 'Loan account lifecycle events (payments, delinquency, payoff, refinance) across loan types.',
    topicTemplate: 'retailBanking/loanServicing/loan/{loanEventType}/v1/{loanType}/{country}/{loanAccountId}',
    variables: [
      {
        name: 'loanEventType',
        description: 'Loan servicing lifecycle event',
        values: ['paymentReceived', 'paymentMissed', 'delinquencyFlagged', 'payoffCompleted', 'refinanced'],
        isCustom: false,
      },
      {
        name: 'loanType',
        description: 'Type of loan',
        values: ['mortgage', 'auto', 'personal', 'studentLoan'],
        isCustom: false,
      },
      {
        name: 'loanAccountId',
        description: 'Loan account identifier',
        values: LOAN_ACCOUNT_IDS,
        isCustom: false,
      },
    ],
  },
  {
    id: 'fs-retail-payments-origination',
    theme: 'Financial Services',
    domain: 'Retail Payments',
    useCase: 'Payment Origination',
    description: 'Payment lifecycle events across channel and method - method options narrow based on channel.',
    topicTemplate: 'retailPayments/payment/{paymentEventType}/v1/{paymentChannel}/{paymentMethod}/{paymentId}',
    variables: [
      {
        name: 'paymentEventType',
        description: 'Payment lifecycle event',
        values: ['initiated', 'authorized', 'declined', 'reversed'],
        isCustom: false,
      },
      {
        name: 'paymentChannel',
        description: 'Channel the payment was originated from',
        values: ['mobile', 'web', 'pos', 'atm', 'branch'],
        isCustom: false,
      },
      {
        name: 'paymentMethod',
        description: 'Payment method used',
        values: ['card', 'ach', 'wire', 'rtp', 'wallet'],
        isCustom: false,
        dependsOn: {
          variable: 'paymentChannel',
          valueMap: {
            mobile: ['card', 'wallet', 'rtp'],
            web: ['card', 'ach', 'wallet'],
            pos: ['card', 'wallet'],
            atm: ['card'],
            branch: ['wire', 'ach', 'card'],
          },
        },
      },
      {
        name: 'paymentId',
        description: 'Payment identifier',
        values: PAYMENT_IDS,
        isCustom: false,
      },
    ],
  },
  {
    id: 'fs-retail-payments-settlement',
    theme: 'Financial Services',
    domain: 'Retail Payments',
    useCase: 'Settlement',
    description: 'Settlement batch lifecycle events across clearing/settlement networks.',
    topicTemplate: 'retailPayments/settlement/{settlementEventType}/v1/{settlementNetwork}/{settlementBatchId}',
    variables: [
      {
        name: 'settlementEventType',
        description: 'Settlement batch lifecycle event',
        values: ['batchCreated', 'cleared', 'failed', 'netted'],
        isCustom: false,
      },
      {
        name: 'settlementNetwork',
        description: 'Clearing/settlement network',
        values: ['ach', 'swift', 'rtp', 'sepa', 'fedwire'],
        isCustom: false,
      },
      {
        name: 'settlementBatchId',
        description: 'Settlement batch identifier',
        values: SETTLEMENT_BATCH_IDS,
        isCustom: false,
      },
    ],
  },
];

/**
 * The wildcard a consumer would use to "watch everything" for a preset - the
 * static prefix up to (not including) the first {variable}, plus `>`. Mirrors
 * the Solace doc's own example subscriptions (e.g. one level wildcarded,
 * then `>` for the rest of the hierarchy).
 */
/** A queue name that actually reflects the preset (e.g. "trade-order-distribution"),
 * not a generic default - the caller appends its own random suffix for uniqueness,
 * matching how a hand-typed queue name is generated today. */
export function presetQueueNameBase(preset: TopicPreset): string {
  return preset.useCase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function presetWildcardSubscription(preset: TopicPreset): string {
  const firstVarIndex = preset.topicTemplate.indexOf('{');
  const staticPrefix = firstVarIndex === -1 ? preset.topicTemplate : preset.topicTemplate.slice(0, firstVarIndex);
  const trimmed = staticPrefix.endsWith('/') ? staticPrefix.slice(0, -1) : staticPrefix;
  return `${trimmed}/>`;
}

export interface TopicDomainGroup {
  theme: string;
  domain: string;
  useCases: TopicPreset[];
}

/** TOPIC_PRESETS grouped by (theme, domain), preserving catalog order - lets
 * the Topic Taxonomy panel show "every use case under Capital Markets" etc.
 * without the presenter having to have already loaded a preset from Add
 * Publisher/Consumer first. */
export const TOPIC_DOMAIN_GROUPS: TopicDomainGroup[] = (() => {
  const groups: TopicDomainGroup[] = [];
  const byKey = new Map<string, TopicDomainGroup>();
  for (const preset of TOPIC_PRESETS) {
    const key = `${preset.theme} ${preset.domain}`;
    let group = byKey.get(key);
    if (!group) {
      group = { theme: preset.theme, domain: preset.domain, useCases: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.useCases.push(preset);
  }
  return groups;
})();

// Resolves any variable name (whether a preset introduces it or just reuses
// an existing default like country/exchange/ticker) to its full definition,
// built once from every known source.
const KNOWN_VARIABLE_DEFS = new Map<string, TopicTaxonomyVariable>();
for (const variable of DEFAULT_TAXONOMY_VARIABLES) KNOWN_VARIABLE_DEFS.set(variable.name, variable);
for (const preset of TOPIC_PRESETS) {
  for (const variable of preset.variables) KNOWN_VARIABLE_DEFS.set(variable.name, variable);
}

/** Every variable actually used (introduced or merely reused) across every
 * use case in a domain group - e.g. Capital Markets includes both Market
 * Data's country/exchange/ticker and Trade Order's own orderEventType/
 * assetClass/orderId (plus exchange again, deduplicated). */
export function variablesForDomain(group: TopicDomainGroup): TopicTaxonomyVariable[] {
  const names = new Set<string>();
  for (const useCase of group.useCases) {
    for (const name of extractVariables(useCase.topicTemplate)) names.add(name);
  }
  const resolved: TopicTaxonomyVariable[] = [];
  for (const name of names) {
    const def = KNOWN_VARIABLE_DEFS.get(name);
    if (def) resolved.push(def);
  }
  return resolved;
}
