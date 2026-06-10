export const APP_CONFIG = {
  backendUrl: 'https://reelswapai-production.up.railway.app',
  initialFreeTokens: 0,
  useRevenueCat: true,
tokenPacks: [
  {
    id: 'tokens_20',
    revenueCatId: 'tokens_20',
    title: 'Starter',
    tokens: 20,
    price: '4,99 €',
    badge: null,
  },
  {
    id: 'tokens_55',
    revenueCatId: 'tokens_55',
    title: 'Pro',
    tokens: 55,
    price: '9,99 €',
    badge: 'Popular',
  },
  {
    id: 'tokens_120',
    revenueCatId: 'tokens_120',
    title: 'Premium',
    tokens: 120,
    price: '19,99 €',
    badge: null,
  },
],
  costs: {
  image: 2,
  video: {
    upTo10: 10,
    upTo20: 18,
    upTo30: 24,
    upTo45: 30,
    upTo60: 35,
  },
},
};

export function getVideoTokens(seconds: number) {
  if (seconds <= 10) return APP_CONFIG.costs.video.upTo10;
  if (seconds <= 20) return APP_CONFIG.costs.video.upTo20;
  if (seconds <= 30) return APP_CONFIG.costs.video.upTo30;
  if (seconds <= 45) return APP_CONFIG.costs.video.upTo45;

  return APP_CONFIG.costs.video.upTo60;
}