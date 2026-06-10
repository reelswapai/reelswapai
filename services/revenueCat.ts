import Purchases from 'react-native-purchases';

const REVENUECAT_API_KEY_IOS = 'appl_lpIIEFOmMnwcWvPnIhFEZVntErW';

export const initRevenueCat = async (userId?: string) => {
  try {
    Purchases.configure({
      apiKey: REVENUECAT_API_KEY_IOS,
      appUserID: userId,
    });

    console.log('RevenueCat inicializado');
  } catch (error) {
    console.log('Error inicializando RevenueCat:', error);
  }
};

export const getRevenueCatOfferings = async () => {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (error) {
    console.log('Error obteniendo offerings:', error);
    return null;
  }
};

export const purchaseRevenueCatPackage = async (packageToBuy: any) => {
  try {
    const purchaseResult = await Purchases.purchasePackage(packageToBuy);
    return purchaseResult;
  } catch (error: any) {
    if (error?.userCancelled) {
      console.log('Compra cancelada por el usuario');
      return null;
    }

    console.log('Error comprando en RevenueCat:', error);
    throw error;
  }
};