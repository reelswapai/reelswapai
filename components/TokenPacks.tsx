import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type TokenPack = {
  id: string;
  revenueCatId: string;
  title: string;
  tokens: number;
  price: string;
  badge: string | null;
};

type Props = {
  packs: TokenPack[];
  styles: any;
  onBuyPack: (pack: TokenPack) => void;
};

export default function TokenPacks({ packs, styles, onBuyPack }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Tokens</Text>

      <View style={styles.tokenGrid}>
        {packs.map((pack) => (
          <TouchableOpacity
            key={pack.id}
            style={[
              styles.tokenPack,
              pack.badge ? styles.tokenPackPopular : null,
            ]}
            onPress={() => onBuyPack(pack)}
          >
            {pack.badge ? (
              <Text style={styles.packBadge}>{pack.badge}</Text>
            ) : null}

            <Text style={styles.packTitle}>{pack.title}</Text>
            <Text style={styles.packTokens}>{pack.tokens} tokens</Text>
            <Text style={styles.packPrice}>{pack.price}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}