import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type Props = {
  mode: 'image' | 'video';
  currentCost: number;
  styles: any;
  onGenerate: () => void;
  generating: boolean;
  canGenerate: boolean;
  disabledReason: string;
  onBuyTokens: () => void;
  canBuyTokensToGenerate: boolean;
  generationRequirementsReady: boolean;
};

export default function GenerateCard({
  mode,
  currentCost,
  styles,
  onGenerate,
  generating,
  canGenerate,
  disabledReason,
  onBuyTokens,
  canBuyTokensToGenerate,
  generationRequirementsReady,
}: Props) {
  const isDisabled = generating || (!canGenerate && !canBuyTokensToGenerate);

  const buttonText = generating
    ? 'Generando...'
    : canBuyTokensToGenerate
      ? 'Comprar tokens para generar'
      : canGenerate
        ? `Generar ${mode === 'image' ? 'Foto' : 'Vídeo'} · ${currentCost} tokens`
        : disabledReason || 'Completa los pasos para generar';

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>3. Generar</Text>

      <Text style={styles.cardText}>
        Esta generación consumirá {currentCost} tokens.
      </Text>

      <TouchableOpacity
        style={[
          styles.generateButton,
          isDisabled ? styles.generateButtonDisabled : null,
        ]}
        onPress={() => {
          if (canBuyTokensToGenerate) {
            onBuyTokens();
            return;
          }

          if (canGenerate) {
            onGenerate();
          }
        }}
        disabled={isDisabled}
      >
        <Text style={styles.generateButtonText}>
          {buttonText}
        </Text>
      </TouchableOpacity>
    </View>
  );
}