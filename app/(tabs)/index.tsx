import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
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
  View
} from 'react-native';

type SwapMode = 'image' | 'video';
type ResultType = 'image' | 'video';

const BACKEND_URL = 'https://reelswapai-production.up.railway.app';

function getVideoTokens(seconds: number) {
  if (seconds <= 10) return 3;
  if (seconds <= 20) return 6;
  if (seconds <= 30) return 10;
  if (seconds <= 45) return 16;
  return 24;
}

export default function HomeScreen() {
  const [mode, setMode] = useState<SwapMode>('video');

  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [targetFile, setTargetFile] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<ResultType | null>(null);
  const [targetDuration, setTargetDuration] = useState<number>(10);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultType, setResultType] = useState<ResultType | null>(null);

  const [tokens, setTokens] = useState(999);
  const [generating, setGenerating] = useState(false);
  const [resultReady, setResultReady] = useState(false);
  const [step, setStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [cloudinaryPublicId, setCloudinaryPublicId] = useState<string | null>(null);

const [cloudinaryResourceType, setCloudinaryResourceType] =
  useState<'image' | 'video' | null>(null);

  const currentCost = mode === 'image' ? 2 : getVideoTokens(targetDuration);

  const previewPlayer = useVideoPlayer(
    targetType === 'video' && targetFile ? targetFile : null,
    (player) => {
      player.loop = true;
    }
  );

  const resultPlayer = useVideoPlayer(
    resultType === 'video' && resultUrl ? resultUrl : null,
    (player) => {
      player.loop = true;
    }
  );

  function resetResult() {
    setResultReady(false);
    setResultUrl(null);
    setResultType(null);
    setShowResult(false);
  }

  function cleanError(error: any) {
    const text = String(error?.message || error || '');

    if (text.includes('content_policy_violation')) {
      return 'El archivo ha sido bloqueado por el proveedor de IA. Prueba con otra foto o vídeo.';
    }

    if (text.includes('timeout')) {
      return 'La generación ha tardado demasiado. Prueba con un vídeo más corto.';
    }

    if (text.includes('Insufficient') || text.includes('balance')) {
      return 'El proveedor indica saldo insuficiente.';
    }

    return 'Algo falló conectando con la IA. Prueba otra vez.';
  }

  async function pickFace() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Necesitamos acceso a tus fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
    });

    if (!result.canceled) {
      setFaceImage(result.assets[0].uri);
      resetResult();
    }
  }

  async function pickTarget() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Necesitamos acceso a tus archivos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:
        mode === 'image'
          ? ImagePicker.MediaTypeOptions.Images
          : ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
      videoMaxDuration: 60,
    });

    if (result.canceled) return;

    const asset = result.assets[0];

    if (mode === 'image') {
      setTargetFile(asset.uri);
      setTargetType('image');
      setTargetDuration(0);
      resetResult();
      Alert.alert('Imagen añadida ✅', 'Foto destino seleccionada.');
      return;
    }

    const isVideo =
      asset.type === 'video' ||
      asset.uri.toLowerCase().includes('.mov') ||
      asset.uri.toLowerCase().includes('.mp4');

    if (!isVideo) {
      Alert.alert('Solo vídeo', 'En modo vídeo necesitas seleccionar un vídeo.');
      return;
    }

    const durationSeconds = Math.ceil((asset.duration || 10000) / 1000);

    if (durationSeconds > 60) {
      Alert.alert(
        'Vídeo demasiado largo',
        'De momento el máximo permitido es 60 segundos.'
      );
      return;
    }

    setTargetFile(asset.uri);
    setTargetType('video');
    setTargetDuration(durationSeconds || 10);
    resetResult();

    Alert.alert(
      'Vídeo añadido ✅',
      `Duración aproximada: ${durationSeconds || 10}s · Coste: ${getVideoTokens(
        durationSeconds || 10
      )} tokens`
    );
  }
async function convertToJpg(uri: string) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [],
    {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return result.uri;
}
  async function generateSwap() {
    if (!faceImage || !targetFile) {
      Alert.alert(
        'Faltan archivos',
        mode === 'image'
          ? 'Sube primero una cara y una foto destino.'
          : 'Sube primero una cara y un vídeo destino.'
      );
      return;
    }

    if (tokens < currentCost) {
      Alert.alert(
        'Tokens insuficientes',
        `Necesitas ${currentCost} tokens para generar.`
      );
      return;
    }

    try {
      setGenerating(true);
      resetResult();
      setProgress(10);
      setStep('Subiendo archivos...');
let finalFace = faceImage;
let finalTarget = targetFile;

if (targetType === 'image') {
  finalFace = await convertToJpg(faceImage);
  finalTarget = await convertToJpg(targetFile);
}
      const formData = new FormData();

      formData.append('face', {
        uri: finalFace,
        name: 'face.jpg',
        type: 'image/jpeg',
      } as any);

      formData.append('target', {
        uri: finalTarget,
        name: mode === 'video' ? 'target.mp4' : 'target.jpg',
        type: mode === 'video' ? 'video/mp4' : 'image/jpeg',
      } as any);

      formData.append('type', mode);

      setProgress(35);
      setStep('Generando con IA...');

      const endpoint = mode === 'image' ? '/imageswap' : '/faceswap';

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log('ERROR BACKEND:', errorText);
        throw new Error(errorText);
      }

      setProgress(80);
      setStep('Preparando resultado...');

      const data = await response.json();

      const finalUrl =
        data.videoUrl ||
        data.imageUrl ||
        data.resultUrl ||
        data.url;

      if (!data.success || !finalUrl) {
        throw new Error(JSON.stringify(data));
      }

      setResultUrl(finalUrl);
      setResultType(mode);

      setProgress(100);
      setGenerating(false);
      setResultReady(true);
      setTokens((prev) => prev - currentCost);

      setHistory((prev) => [
        `${mode === 'image' ? 'Foto' : 'Vídeo'} · ${currentCost} tokens`,
        ...prev,
      ]);

      Alert.alert(
        'Resultado listo 🔥',
        mode === 'image'
          ? 'Imagen generada correctamente.'
          : 'Vídeo generado correctamente.'
      );
    } catch (error) {
      console.log(error);
      setGenerating(false);
      Alert.alert('Error', cleanError(error));
    }
  }

  async function shareResult() {
  try {
    const fileToShare = resultUrl || targetFile;

    if (!fileToShare) {
      Alert.alert('Sin resultado');
      return;
    }

    const permission =
      await MediaLibrary.requestPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permiso requerido',
        'Necesitamos permiso para guardar archivos.'
      );
      return;
    }

    const extension =
  fileToShare.includes('.mp4') || fileToShare.includes('.mov')
    ? 'mp4'
    : 'jpg';

    const localUri =
      FileSystem.documentDirectory +
      `reelswap-${Date.now()}.${extension}`;

    setStep('Descargando resultado...');
    setGenerating(true);

    const download = await FileSystem.downloadAsync(
      fileToShare,
      localUri
    );

    const asset = await MediaLibrary.createAssetAsync(download.uri);

await MediaLibrary.createAlbumAsync(
  'ReelSwap AI',
  asset,
  false
);

    setGenerating(false);

    const canShare =
      await Sharing.isAvailableAsync();

    if (!canShare) {
      Alert.alert(
        'Guardado',
        'Resultado guardado en galería.'
      );
      return;
    }

    await Sharing.shareAsync(download.uri);

    Alert.alert(
      'Guardado ✅',
      'Resultado guardado en galería.'
    );
  } catch (error) {
    console.log(error);

    setGenerating(false);

    Alert.alert(
      'Error',
      'No se pudo guardar el resultado.'
    );
  }
}

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.topRow}>
          <Text style={styles.badge}>AI FACE SWAP</Text>

          <TouchableOpacity onPress={() => setTokens(tokens + 50)}>
            <Text style={styles.tokens}>⚡ {tokens} tokens</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>ReelSwap AI</Text>

        <Text style={styles.subtitle}>
          Cambia tu rostro en fotos y vídeos con calidad premium.
        </Text>

        <View style={styles.modeSwitch}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              mode === 'video' && styles.modeButtonActive,
            ]}
            onPress={() => setMode('video')}
          >
            <Text
              style={[
                styles.modeText,
                mode === 'video' && styles.modeTextActive,
              ]}
            >
              Vídeo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeButton,
              mode === 'image' && styles.modeButtonActive,
            ]}
            onPress={() => setMode('image')}
          >
            <Text
              style={[
                styles.modeText,
                mode === 'image' && styles.modeTextActive,
              ]}
            >
              Foto
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={generateSwap}>
          <Text style={styles.buttonText}>
            ✨ Crear ahora · {currentCost} tokens
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Tu rostro</Text>
        <Text style={styles.cardText}>
          Elige una foto clara de la cara que quieres usar.
        </Text>

        {faceImage && <Image source={{ uri: faceImage }} style={styles.preview} />}

        <TouchableOpacity style={styles.secondaryButton} onPress={pickFace}>
          <Text style={styles.secondaryButtonText}>
            {faceImage ? 'Cambiar rostro' : 'Seleccionar rostro'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          2. {mode === 'image' ? 'Foto destino' : 'Vídeo destino'}
        </Text>

        <Text style={styles.cardText}>
          {mode === 'image'
            ? 'Elige la imagen donde quieres aplicar el rostro. Coste: 2 tokens.'
            : 'Elige un vídeo de máximo 60 segundos. El coste depende de la duración.'}
        </Text>

        {targetFile && targetType === 'image' && (
          <Image source={{ uri: targetFile }} style={styles.preview} />
        )}

        {targetFile && targetType === 'video' && (
          <View style={styles.videoBox}>
            <VideoView
              player={previewPlayer}
              style={styles.video}
              allowsFullscreen
              nativeControls
              contentFit="contain"
            />
          </View>
        )}

        {mode === 'video' && targetFile && (
          <Text style={styles.costText}>
            Duración: {targetDuration}s · Coste: {currentCost} tokens
          </Text>
        )}

        <TouchableOpacity style={styles.secondaryButton} onPress={pickTarget}>
          <Text style={styles.secondaryButtonText}>
            {targetFile ? 'Cambiar destino' : 'Seleccionar destino'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tokens</Text>

        <View style={styles.tokenGrid}>
          <View style={styles.tokenPack}>
            <Text style={styles.packTitle}>Starter</Text>
            <Text style={styles.packTokens}>20 tokens</Text>
            <Text style={styles.packPrice}>2,99 €</Text>
          </View>

          <View style={styles.tokenPackPopular}>
            <Text style={styles.packBadge}>POPULAR</Text>
            <Text style={styles.packTitle}>Pro</Text>
            <Text style={styles.packTokens}>55 tokens</Text>
            <Text style={styles.packPrice}>6,99 €</Text>
          </View>
        </View>

        <Text style={styles.cardText}>
          Próximamente conectaremos estos packs con RevenueCat.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>3. Generar</Text>
        <Text style={styles.cardText}>
          Esta generación consumirá {currentCost} tokens.
        </Text>

        <TouchableOpacity style={styles.generateButton} onPress={generateSwap}>
          <Text style={styles.generateButtonText}>
            Generar {mode === 'image' ? 'Foto' : 'Vídeo'} · {currentCost} tokens
          </Text>
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
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>

          <Text style={styles.cardText}>
            La IA está generando el resultado. No cierres la app.
          </Text>
        </View>
      )}

      {resultReady && resultUrl && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Resultado listo 🎉</Text>

          <Text style={styles.cardText}>
            Tu {resultType === 'image' ? 'imagen' : 'vídeo'} ya está preparado.
          </Text>

          <TouchableOpacity
            style={styles.resultPreviewCard}
            onPress={() => setShowResult(true)}
          >
            {resultType === 'image' ? (
              <Image source={{ uri: resultUrl }} style={styles.resultImagePreview} />
            ) : (
              <>
                <Text style={styles.resultPlayIcon}>▶</Text>
                <Text style={styles.resultPreviewTitle}>Vídeo generado</Text>
                <Text style={styles.resultPreviewSubtitle}>Toca para verlo</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.resultActions}>
            <TouchableOpacity style={styles.resultActionButton} onPress={shareResult}>
              <Text style={styles.resultActionText}>Compartir</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resultActionButton}
              onPress={() => {
                setFaceImage(null);
                setTargetFile(null);
                setTargetType(null);
                resetResult();
              }}
            >
              <Text style={styles.resultActionText}>Otro</Text>
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
              <Text style={styles.historyIcon}>
                {item.includes('Foto') ? '🖼️' : '🎬'}
              </Text>
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
            {resultType === 'image' && resultUrl ? (
              <Image source={{ uri: resultUrl }} style={styles.fullscreenImage} />
            ) : resultType === 'video' && resultUrl ? (
              <VideoView
                player={resultPlayer}
                style={styles.fullscreenVideo}
                allowsFullscreen
                nativeControls
                contentFit="contain"
              />
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
    backgroundColor: '#050509',
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  hero: {
    backgroundColor: '#11111C',
    borderRadius: 32,
    padding: 24,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    color: '#A78BFA',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
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
    color: '#B6B6CA',
    fontSize: 16,
    marginTop: 10,
    lineHeight: 24,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#050509',
    borderRadius: 18,
    padding: 5,
    marginTop: 22,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#8B5CF6',
  },
  modeText: {
    color: '#B6B6CA',
    fontWeight: '900',
  },
  modeTextActive: {
    color: 'white',
  },
  button: {
    backgroundColor: 'white',
    paddingVertical: 16,
    borderRadius: 18,
    marginTop: 20,
    alignItems: 'center',
  },
  buttonText: {
    color: '#111',
    fontWeight: '900',
    fontSize: 16,
  },
  card: {
    backgroundColor: '#11111C',
    marginTop: 20,
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    backgroundColor: 'rgba(139,92,246,0.16)',
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
    height: 240,
    borderRadius: 20,
    marginTop: 16,
    backgroundColor: '#000',
  },
  videoBox: {
    width: '100%',
    height: 320,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginTop: 16,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  costText: {
    color: '#FACC15',
    marginTop: 12,
    fontWeight: '900',
  },
  tokenGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  tokenPack: {
    flex: 1,
    backgroundColor: '#1A1A2C',
    borderRadius: 18,
    padding: 16,
  },
  tokenPackPopular: {
    flex: 1,
    backgroundColor: '#261B4D',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  packBadge: {
    color: '#FACC15',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 6,
  },
  packTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 16,
  },
  packTokens: {
    color: '#B6B6CA',
    marginTop: 8,
  },
  packPrice: {
    color: 'white',
    fontWeight: '900',
    fontSize: 20,
    marginTop: 8,
  },
  loaderCard: {
    backgroundColor: '#151525',
    marginTop: 20,
    borderRadius: 26,
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
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 10,
  },
  progressText: {
    color: '#A78BFA',
    fontSize: 14,
    marginTop: 10,
    fontWeight: '700',
  },
  resultCard: {
    backgroundColor: '#151525',
    marginTop: 20,
    borderRadius: 26,
    padding: 20,
  },
  resultTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
  fakeResultText: {
    color: 'white',
    fontWeight: '900',
  },
  resultPreviewCard: {
    width: '100%',
    height: 240,
    backgroundColor: '#050509',
    borderRadius: 22,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
    overflow: 'hidden',
  },
  resultImagePreview: {
    width: '100%',
    height: '100%',
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
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: '#050509',
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
    height: 520,
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
    backgroundColor: '#1A1A2C',
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