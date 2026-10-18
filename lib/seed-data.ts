export type BulkTier = { minQty: number; unitPrice: number };
export type SeedProduct = {
  id: string; categorySlug: string; title: string; desc: string;
  contents: string; priceUsdt: number; tiers: BulkTier[]; stock: number; status: 'ACTIVE' | 'OOS';
};
export const CATEGORIES = [
  { slug: 'github', name: 'GitHub', emoji: '🐙', sort: 1 , logo: '/logos/github.svg' },
  { slug: 'capcut', name: 'CapCut', emoji: '🎬', sort: 2 , logo: '/logos/capcut.svg' },
  { slug: 'grok', name: 'Grok', emoji: '🤖', sort: 3 , logo: '/logos/grok.svg' },
  { slug: 'canva', name: 'Canva', emoji: '🎨', sort: 4 , logo: '/logos/canva.svg' },
  { slug: 'chatgpt', name: 'ChatGPT', emoji: '💬', sort: 5 , logo: '/logos/chatgpt.svg' },
  { slug: 'loveable', name: 'Loveable Pro', emoji: '🪄', sort: 6 , logo: '/logos/loveable.svg' },
  { slug: 'gemini', name: 'Gemini', emoji: '✨', sort: 7 , logo: '/logos/gemini.svg' },
  { slug: 'claude', name: 'Claude', emoji: '🧠', sort: 8 , logo: '/logos/claude.svg' },
  { slug: 'email', name: 'Email', emoji: '📧', sort: 9 , logo: '/logos/email.svg' },
  { slug: 'tz-vip', name: 'EM VIP', emoji: '👑', sort: 10 , logo: '/logos/tz-vip.svg' },
  { slug: 'youtube', name: 'YouTube', emoji: '▶️', sort: 11 , logo: '/logos/youtube.svg' },
  { slug: 'muse-ai', name: 'Muse AI', emoji: '♾️', sort: 12 , logo: '/logos/muse.svg' },
  { slug: 'telegram-premium', name: 'Telegram Premium', emoji: '✈️', sort: 13 , logo: '/logos/telegram-premium.svg' },
  { slug: 'figma', name: 'Figma', emoji: '🖌️', sort: 14 , logo: '/logos/figma.svg' },
  { slug: 'vpn', name: 'VPN', emoji: '🛡️', sort: 15 , logo: '/logos/vpn.svg' },
  { slug: 'duolingo', name: 'Duolingo', emoji: '🦉', sort: 16 , logo: '/logos/duolingo.svg' },
  { slug: 'leonardo', name: 'Leonardo AI', emoji: '🎭', sort: 17 , logo: '/logos/leonardo.svg' },
];
export const PRODUCTS: SeedProduct[] = [
  { id: 'p-github-student', categorySlug: 'github', title: 'GitHub Student Developer Pack', desc: 'The best developer tools, free for students. Get your GitHub Student Developer Pack now.', contents: 'Format: Email | Password | 2FA', priceUsdt: 10.0, tiers: [{ minQty: 1, unitPrice: 10.0 }, { minQty: 3, unitPrice: 9.5 }, { minQty: 10, unitPrice: 8.5 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-capcut-1m', categorySlug: 'capcut', title: 'CapCut Pro Team 1M', desc: 'CapCut Pro team seat, 1 month.', contents: 'Login / team invite link. ETA: instant.', priceUsdt: 1.8, tiers: [{ minQty: 1, unitPrice: 1.8 }, { minQty: 5, unitPrice: 1.65 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-grok-1m', categorySlug: 'grok', title: 'Grok Premium 1M', desc: 'Grok AI premium access, 1 month.', contents: 'Login credentials. ETA: instant.', priceUsdt: 4.5, tiers: [{ minQty: 1, unitPrice: 4.5 }, { minQty: 3, unitPrice: 4.2 }, { minQty: 10, unitPrice: 3.8 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-canva-1m', categorySlug: 'canva', title: 'Canva Pro Team 1M', desc: 'Canva Pro team invite, 1 month.', contents: 'Team invite link. ETA: instant.', priceUsdt: 1.5, tiers: [{ minQty: 1, unitPrice: 1.5 }, { minQty: 5, unitPrice: 1.35 }, { minQty: 15, unitPrice: 1.2 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-chatgpt-1m', categorySlug: 'chatgpt', title: 'ChatGPT Plus 1M', desc: 'ChatGPT Plus upgrade, 1 month.', contents: 'Invite / upgrade code. ETA: instant.', priceUsdt: 6.0, tiers: [{ minQty: 1, unitPrice: 6.0 }, { minQty: 3, unitPrice: 5.6 }, { minQty: 10, unitPrice: 5.0 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-loveable-pro', categorySlug: 'loveable', title: 'Loveable Pro 1M', desc: 'Loveable AI Pro full access seat, 1 month.', contents: 'Login / invite credentials. ETA: instant.', priceUsdt: 12.0, tiers: [{ minQty: 1, unitPrice: 12.0 }, { minQty: 3, unitPrice: 11.0 }, { minQty: 10, unitPrice: 9.8 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-gemini-18m', categorySlug: 'gemini', title: 'Gemini 18 Months', desc: 'Gemini upgrade code, 18 months.', contents: 'Redeem code + steps. ETA: instant.', priceUsdt: 0.75, tiers: [{ minQty: 1, unitPrice: 0.75 }, { minQty: 6, unitPrice: 0.7 }, { minQty: 16, unitPrice: 0.65 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-claude-1m', categorySlug: 'claude', title: 'Claude Pro 1M', desc: 'Claude Pro upgrade, 1 month.', contents: 'Login / redeem code. ETA: instant.', priceUsdt: 5.0, tiers: [{ minQty: 1, unitPrice: 5.0 }, { minQty: 3, unitPrice: 4.6 }, { minQty: 10, unitPrice: 4.2 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-email-1m', categorySlug: 'email', title: 'Business Email 1M', desc: 'Custom domain business mailbox, 1 month.', contents: 'Webmail credentials. ETA: instant.', priceUsdt: 2.0, tiers: [{ minQty: 1, unitPrice: 2.0 }, { minQty: 5, unitPrice: 1.8 }, { minQty: 15, unitPrice: 1.6 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-youtube-1m', categorySlug: 'youtube', title: 'YouTube Premium 1M', desc: 'YouTube Premium upgrade, 1 month.', contents: 'Family invite link. ETA: instant.', priceUsdt: 2.5, tiers: [{ minQty: 1, unitPrice: 2.5 }, { minQty: 5, unitPrice: 2.25 }, { minQty: 15, unitPrice: 2.0 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-muse-1m', categorySlug: 'muse-ai', title: 'Muse AI Pro 1M', desc: 'Muse AI Pro subscription, 1 month.', contents: 'Direct login. ETA: instant.', priceUsdt: 8.0, tiers: [{ minQty: 1, unitPrice: 8.0 }, { minQty: 3, unitPrice: 7.4 }, { minQty: 10, unitPrice: 6.8 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-tg-prem-3m', categorySlug: 'telegram-premium', title: 'Telegram Premium 3 Months', desc: 'Telegram Premium gift activation, 3 months.', contents: 'Gift link / handle activation. ETA: instant.', priceUsdt: 11.0, tiers: [{ minQty: 1, unitPrice: 11.0 }, { minQty: 3, unitPrice: 10.2 }, { minQty: 10, unitPrice: 9.5 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-figma-1m', categorySlug: 'figma', title: 'Figma Professional 1M', desc: 'Figma Pro seat with unlimited files, 1 month.', contents: 'Team invite link. ETA: instant.', priceUsdt: 5.0, tiers: [{ minQty: 1, unitPrice: 5.0 }, { minQty: 3, unitPrice: 4.6 }, { minQty: 10, unitPrice: 4.0 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-tz-vip-1m', categorySlug: 'tz-vip', title: 'TZ VIP 1M', desc: 'TZ Store VIP membership, priority delivery.', contents: 'VIP role + priority support. ETA: instant.', priceUsdt: 9.0, tiers: [{ minQty: 1, unitPrice: 9.0 }, { minQty: 3, unitPrice: 8.2 }, { minQty: 10, unitPrice: 7.5 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-vpn-12m', categorySlug: 'vpn', title: 'VPN 12 Months', desc: 'Private VPN key, 12 months, multi-device.', contents: 'VLESS subscription URL. ETA: instant.', priceUsdt: 12.0, tiers: [{ minQty: 1, unitPrice: 12 }, { minQty: 3, unitPrice: 11 }, { minQty: 10, unitPrice: 9.9 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-duolingo-12m', categorySlug: 'duolingo', title: 'Duolingo Super 12 Months', desc: 'Duolingo Super family invite, 12 months.', contents: 'Family invite link. ETA: instant.', priceUsdt: 8.5, tiers: [{ minQty: 1, unitPrice: 8.5 }, { minQty: 3, unitPrice: 7.9 }, { minQty: 10, unitPrice: 7.2 }], stock: 100, status: 'ACTIVE' },
  { id: 'p-leonardo-1m', categorySlug: 'leonardo', title: 'Leonardo AI Apprentice 1M', desc: 'Leonardo AI premium tokens, 1 month.', contents: 'Account credentials. ETA: instant.', priceUsdt: 7.0, tiers: [{ minQty: 1, unitPrice: 7.0 }, { minQty: 3, unitPrice: 6.4 }, { minQty: 10, unitPrice: 5.8 }], stock: 100, status: 'ACTIVE' },
];
export function unitPriceFor(p: SeedProduct, qty: number) {
  let unit = p.priceUsdt;
  for (const t of [...p.tiers].sort((a, b) => a.minQty - b.minQty)) if (qty >= t.minQty) unit = t.unitPrice;
  return unit;
}
