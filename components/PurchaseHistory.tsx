import React from 'react';
import { Text, View } from 'react-native';

type Props = {
  purchases: any[];
  styles: any;
  formatDate: (dateString?: string) => string;
};

export default function PurchaseHistory({
  purchases,
  styles,
  formatDate,
}: Props) {
  if (purchases.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Últimas compras</Text>

      {purchases.map((item) => (
        <View key={item.id} style={styles.historyItem}>
          <Text style={styles.historyIcon}>🪙</Text>

          <View style={{ flex: 1 }}>
            <Text style={styles.historyTitle}>
              Compra de tokens · +{item.tokensAdded} tokens
            </Text>

            <Text style={styles.historySubtitle}>
              {item.packTitle || 'Pack de tokens'} · {item.price} ·{' '}
              {item.mode === 'free'
                ? 'Gratis'
                : item.mode === 'test'
                ? 'Modo prueba'
                : 'RevenueCat'}{' '}
              · {formatDate(item.createdAt)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}