import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  generations: any[];
  styles: any;
  formatDate: (dateString?: string) => string;
  onOpenPreview: (url: string, type: 'image' | 'video') => void;
};

export default function GenerationHistory({
  generations,
  styles,
  formatDate,
  onOpenPreview,
}: Props) {
  if (generations.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Historial de generaciones</Text>

      {generations.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.historyItem}
          onPress={() => {
            if (item.resultUrl) {
              onOpenPreview(item.resultUrl, item.type);
            }
          }}
        >
          {item.type === 'image' && item.resultUrl ? (
            <Image
              source={{ uri: item.resultUrl }}
              style={styles.historyThumbnail}
            />
          ) : (
            <View style={styles.historyVideoThumbnail}>
              <Text style={styles.historyVideoIcon}>
                {item.type === 'video' ? '🎬' : '🖼️'}
              </Text>
            </View>
          )}

          <View>
            <Text style={styles.historyTitle}>
              {item.type === 'image' ? 'Foto generada' : 'Vídeo generado'} · {item.cost} tokens
            </Text>

            <Text style={styles.historySubtitle}>
              Listo para compartir · {formatDate(item.createdAt)}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}