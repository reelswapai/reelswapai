import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function HomeScreen() {
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [targetFile, setTargetFile] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<'image' | 'video' | null>(null);
  const [tokens, setTokens] = useState(999);
  const [generating, setGenerating] = useState(false);
  const [resultReady, setResultReady] = useState(false);
  const [step, setStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);

  const player = useVideoPlayer(
    targetType === 'video' && targetFile ? targetFile : null,
    (player) => {
      player.loop = true;
    }
  );

  async function pickFace() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Necesitamos acceso a tus fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled) {
      setFaceImage(result.assets[0].uri);
      setResultReady(false);
    }
  }

  async function pickTarget() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Necesitamos acceso a tus archivos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 1,
      videoMaxDuration: 300,
    });

    if (!result.canceled) {
      const asset = result.assets[0];

      const isVideo =
        asset.type === 'video' ||
        asset.uri.toLowerCase().includes('.mov') ||
        asset.uri.toLowerCase().includes('.mp4');

      setTargetFile(asset.uri);
      setTargetType(isVideo ? 'video' : 'image');
      setResultReady(false);

      Alert.alert('Archivo añadido', isVideo ? 'Vídeo seleccionado ✅' : 'Imagen seleccionada ✅');
    }
  }

  function generateSwap() {
    if (!faceImage || !targetFile) {
      Alert.alert('Faltan archivos', 'Sube primero una cara y una foto o vídeo destino.');
      return;
    }

    if (tokens < 3) {
      Alert.alert('Tokens insuficientes', 'Necesitas 3 tokens para generar.');
      return;
    }

    setTokens(tokens - 3);
    setGenerating(true);
    setResultReady(false);
    setProgress(0);

    const steps = [
      'Analizando rostro...',
      'Detectando movimiento...',
      'Aplicando face swap...',
      'Renderizando resultado...',
    ];

    let index = 0;
    setStep(steps[index]);

    const interval = setInterval(() => {
  index += 1;

  if (index < steps.length) {
    setStep(steps[index]);
    setProgress((index / steps.length) * 100);
  } else {
    clearInterval(interval);
    setProgress(100);
    setGenerating(false);
    setResultReady(true);
setHistory((prev) => [
  `Resultado ${prev.length + 1} · ${targetType === 'video' ? 'Vídeo' : 'Imagen'}`,
  ...prev,
]);
setStep('');
  }
}, 1800);
  }

async function shareResult() {
  if (!targetFile) {
    Alert.alert('Sin resultado', 'Primero genera un resultado.');
    return;
  }

  const canShare = await Sharing.isAvailableAsync();

  if (!canShare) {
    Alert.alert('No disponible', 'Compartir no está disponible en este dispositivo.');
    return;
  }

  await Sharing.shareAsync(targetFile);
}

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.topRow}>
          <Text style={styles.badge}>IA FACE SWAP</Text>

          <TouchableOpacity onPress={() => setTokens(tokens + 50)}>
            <Text style={styles.tokens}>⚡ {tokens} tokens</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>ReelSwap AI</Text>

        <Text style={styles.subtitle}>
          Crea vídeos virales con tu rostro en segundos.
        </Text>

        <TouchableOpacity style={styles.button} onPress={generateSwap}>
          <Text style={styles.buttonText}>✨ Crear ahora</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Sube tu rostro</Text>
        <Text style={styles.cardText}>Elige la cara que quieres usar para el face swap.</Text>

        {faceImage && <Image source={{ uri: faceImage }} style={styles.preview} />}

        <TouchableOpacity style={styles.secondaryButton} onPress={pickFace}>
          <Text style={styles.secondaryButtonText}>
            {faceImage ? 'Cambiar rostro' : 'Seleccionar rostro'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>2. Sube foto o vídeo destino</Text>
        <Text style={styles.cardText}>Máximo recomendado: 5 minutos.</Text>

        {targetFile && targetType === 'image' && (
          <Image source={{ uri: targetFile }} style={styles.preview} />
        )}

        {targetFile && targetType === 'video' && (
  <View style={styles.videoBox}>
    <VideoView
      player={player}
      style={styles.video}
      allowsFullscreen
      nativeControls
      contentFit="contain"
    />
  </View>
)}

        <TouchableOpacity style={styles.secondaryButton} onPress={pickTarget}>
          <Text style={styles.secondaryButtonText}>
            {targetFile ? 'Cambiar archivo' : 'Seleccionar archivo'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>3. Generar</Text>
        <Text style={styles.cardText}>
          La prueba consume 3 tokens. De momento es una simulación premium.
        </Text>

        <TouchableOpacity style={styles.generateButton} onPress={generateSwap}>
          <Text style={styles.generateButtonText}>Generar Face Swap · 3 tokens</Text>
        </TouchableOpacity>
      </View>

      {generating && (
        <View style={styles.loaderCard}>
          <Text style={styles.loaderIcon}>✨</Text>
          <Text style={styles.resultTitle}>{step}</Text>
          <Text style={styles.progressText}>
  {Math.round(progress)}% completado
</Text>
          <View style={styles.progressBar}>
            <View
  style={[
    styles.progressFill,
    { width: `${progress}%` }
  ]}
/>
          </View>

          <Text style={styles.cardText}>
            Nuestra IA está preparando el resultado final.
          </Text>
        </View>
      )}

      {resultReady && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Resultado listo 🎉</Text>

          <Text style={styles.cardText}>
            Demo completada. El siguiente paso será conectar la API real de face swap.
          </Text>

<TouchableOpacity
  style={styles.resultPreviewCard}
  onPress={() => setShowResult(true)}
>
  <Text style={styles.resultPlayIcon}>▶</Text>

  <Text style={styles.resultPreviewTitle}>
    Resultado generado
  </Text>

  <Text style={styles.resultPreviewSubtitle}>
    Toca para ver el vídeo
  </Text>
</TouchableOpacity>
<View style={styles.resultActions}>
  <TouchableOpacity style={styles.resultActionButton} onPress={shareResult}>
    <Text style={styles.resultActionText}>Compartir</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={styles.resultActionButton}
    onPress={() => {
      setResultReady(false);
      setFaceImage(null);
      setTargetFile(null);
      setTargetType(null);
    }}
  >
    <Text style={styles.resultActionText}>Generar otro</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={styles.resultActionButtonPremium}
    onPress={() => setTokens(tokens + 50)}
  >
    <Text style={styles.resultActionTextPremium}>+50 tokens</Text>
  </TouchableOpacity>
</View>
        </View>
      )}
      {history.length > 0 && (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>Historial</Text>

    {history.map((item, index) => (
      <View key={index} style={styles.historyItem}>
        <Text style={styles.historyIcon}>🎬</Text>
        <View>
          <Text style={styles.historyTitle}>{item}</Text>
          <Text style={styles.historySubtitle}>Listo para compartir</Text>
        </View>
      </View>
    ))}
  </View>
)}
      <Modal visible={showResult} animationType="slide">
  <View style={styles.fullscreenOverlay}>
    <TouchableOpacity
      style={styles.closeButton}
      onPress={() => setShowResult(false)}
    >
      <Text style={styles.closeButtonText}>✕</Text>
    </TouchableOpacity>

    <Text style={styles.fullscreenTitle}>Resultado generado</Text>

    <View style={styles.fullscreenVideoBox}>
      {targetFile && targetType === 'video' ? (
        <VideoView
          player={player}
          style={styles.fullscreenVideo}
          allowsFullscreen
          nativeControls
          contentFit="contain"
        />
      ) : targetFile && targetType === 'image' ? (
        <Image source={{ uri: targetFile }} style={styles.fullscreenImage} />
      ) : (
        <Text style={styles.fakeResultText}>No hay resultado</Text>
      )}
    </View>

    <TouchableOpacity style={styles.generateButton} onPress={shareResult}>
  <Text style={styles.generateButtonText}>Compartir resultado</Text>
</TouchableOpacity>
  </View>
</Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080814',
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  hero: {
    backgroundColor: '#8B5CF6',
    borderRadius: 30,
    padding: 24,
    marginTop: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    color: 'white',
    fontWeight: '900',
  },
  tokens: {
    color: '#FACC15',
    fontWeight: '900',
  },
  title: {
    color: 'white',
    fontSize: 42,
    fontWeight: '900',
    marginTop: 24,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    marginTop: 10,
    lineHeight: 24,
  },
  button: {
    backgroundColor: 'white',
    paddingVertical: 16,
    borderRadius: 18,
    marginTop: 24,
    alignItems: 'center',
  },
  buttonText: {
    color: '#111',
    fontWeight: '900',
    fontSize: 16,
  },
  card: {
    backgroundColor: '#161625',
    marginTop: 20,
    borderRadius: 24,
    padding: 20,
  },
  cardTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 10,
  },
  cardText: {
    color: '#B6B6CA',
    fontSize: 15,
    lineHeight: 22,
  },
  secondaryButton: {
    backgroundColor: 'rgba(139,92,246,0.18)',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryButtonText: {
    color: '#A78BFA',
    fontWeight: '900',
  },
  generateButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  generateButtonText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 16,
  },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    marginTop: 16,
  },
  videoBox: {
    width: '100%',
    height: 320,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginTop: 16,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loaderCard: {
    backgroundColor: '#202033',
    marginTop: 20,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  loaderIcon: {
    fontSize: 42,
    marginBottom: 12,
  },
  progressBar: {
    width: '100%',
    height: 10,
    borderRadius: 10,
    backgroundColor: '#31314A',
    marginVertical: 18,
    overflow: 'hidden',
  },
  progressFill: {
    width: '70%',
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 10,
  },
  resultCard: {
    backgroundColor: '#202033',
    marginTop: 20,
    borderRadius: 24,
    padding: 20,
  },
  resultTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
fakeResult: {
  height: 220,
  backgroundColor: '#111827',
  borderRadius: 20,
  marginTop: 18,
  overflow: 'hidden',
  alignItems: 'center',
  justifyContent: 'center',
},
  fakeResultText: {
    color: 'white',
    fontWeight: '900',
  },
resultVideoWrapper: {
  width: '92%',
  height: 190,
  borderRadius: 16,
  overflow: 'hidden',
  backgroundColor: '#000',
},

resultVideo: {
  width: '100%',
  height: '100%',
},
resultPreviewCard: {
  width: '100%',
  height: 220,
  backgroundColor: '#111827',
  borderRadius: 20,
  marginTop: 18,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(139,92,246,0.35)',
},

resultPlayIcon: {
  color: 'white',
  fontSize: 46,
  fontWeight: '900',
  marginBottom: 12,
},

resultPreviewTitle: {
  color: 'white',
  fontSize: 22,
  fontWeight: '900',
},

resultPreviewSubtitle: {
  color: '#B6B6CA',
  fontSize: 14,
  marginTop: 6,
},
progressText: {
  color: '#A78BFA',
  fontSize: 14,
  marginTop: 10,
  fontWeight: '700',
},
fullscreenOverlay: {
  flex: 1,
  backgroundColor: '#05050A',
  padding: 20,
  justifyContent: 'center',
},

closeButton: {
  position: 'absolute',
  top: 55,
  right: 24,
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: 'rgba(255,255,255,0.12)',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10,
},

closeButtonText: {
  color: 'white',
  fontSize: 22,
  fontWeight: '900',
},

fullscreenTitle: {
  color: 'white',
  fontSize: 28,
  fontWeight: '900',
  textAlign: 'center',
  marginBottom: 20,
},

fullscreenVideoBox: {
  width: '100%',
  height: 460,
  backgroundColor: '#000',
  borderRadius: 24,
  overflow: 'hidden',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 24,
},

fullscreenVideo: {
  width: '100%',
  height: '100%',
},

fullscreenImage: {
  width: '100%',
  height: '100%',
  resizeMode: 'contain',
},
historyItem: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
  backgroundColor: '#202033',
  borderRadius: 16,
  padding: 14,
  marginTop: 12,
},

historyIcon: {
  fontSize: 26,
},

historyTitle: {
  color: 'white',
  fontWeight: '900',
  fontSize: 15,
},

historySubtitle: {
  color: '#B6B6CA',
  fontSize: 13,
  marginTop: 3,
},
resultActions: {
  flexDirection: 'row',
  gap: 10,
  marginTop: 16,
},

resultActionButton: {
  flex: 1,
  backgroundColor: 'rgba(139,92,246,0.18)',
  paddingVertical: 13,
  borderRadius: 14,
  alignItems: 'center',
},

resultActionButtonPremium: {
  flex: 1,
  backgroundColor: '#FACC15',
  paddingVertical: 13,
  borderRadius: 14,
  alignItems: 'center',
},

resultActionText: {
  color: '#A78BFA',
  fontWeight: '900',
  fontSize: 12,
},

resultActionTextPremium: {
  color: '#111',
  fontWeight: '900',
  fontSize: 12,
},
});