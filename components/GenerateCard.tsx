import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type Props = {
  mode: 'image' | 'video';
  currentCost: number;
  styles: any;
  onGenerate: () => void;
  generating: boolean;
};

export default function GenerateCard({
  mode,
  currentCost,
  styles,
  onGenerate,
  generating,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>3. Generar</Text>

      <Text style={styles.cardText}>
        Esta generación consumirá {currentCost} tokens.
      </Text>

      <TouchableOpacity
  style={[
    styles.generateButton,
    generating ? styles.generateButtonDisabled : null,
  ]}
  onPress={onGenerate}
  disabled={generating}
>
  <Text style={styles.generateButtonText}>
    {generating
      ? 'Generando...'
      : `Generar ${mode === 'image' ? 'Foto' : 'Vídeo'} · ${currentCost} tokens`}
  </Text>
</TouchableOpacity>
    </View>
  );
}