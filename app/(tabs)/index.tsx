import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { VideoView, useVideoPlayer } from 'expo-video';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Purchases from 'react-native-purchases';
import { loginUser, registerUser } from '../../auth';
import GenerateCard from '../../components/GenerateCard';
import GenerationHistory from '../../components/GenerationHistory';
import PurchaseHistory from '../../components/PurchaseHistory';
import TokenPacks from '../../components/TokenPacks';
import { auth, db } from "../../firebaseConfig";

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
  const scrollRef = useRef<ScrollView>(null);
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [targetFile, setTargetFile] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<ResultType | null>(null);
  const [targetDuration, setTargetDuration] = useState<number>(10);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'video' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultType, setResultType] = useState<ResultType | null>(null);
  const USE_REVENUECAT = false;
  type DetectedFace = {
  index: number;
  x: number;      // normalizado 0..1
  y: number;      // normalizado 0..1
  width: number;  // normalizado 0..1
  height: number; // normalizado 0..1
};

const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
const [selectedFaceIndex, setSelectedFaceIndex] = useState<number | null>(null);
const [previewUri, setPreviewUri] = useState<string | null>(null);
const [previewWidth, setPreviewWidth] = useState(0);
const [previewHeight, setPreviewHeight] = useState(0);
const [detectingFaces, setDetectingFaces] = useState(false);

  const TOKEN_PACKS = [
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
];
  const [tokens, setTokens] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [resultReady, setResultReady] = useState(false);
  const [step, setStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [generationHistory, setGenerationHistory] = useState<any[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [cloudinaryPublicId, setCloudinaryPublicId] =
    useState<string | null>(null);

  const [cloudinaryResourceType, setCloudinaryResourceType] =
    useState<'image' | 'video' | null>(null);

  const currentCost = mode === 'image' ? 2 : getVideoTokens(targetDuration);
async function detectFaces(fileUri: string) {
  try {
    setDetectingFaces(true);
    setDetectedFaces([]);
    setSelectedFaceIndex(null);

    const formData = new FormData();
    formData.append('target', {
      uri: fileUri,
      name: 'target.jpg',
      type: 'image/jpeg',
    } as any);

    const response = await fetch(
      'https://reelswapai-production.up.railway.app/detect-faces',
      {
        method: 'POST',
        body: formData,
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'No se pudieron detectar caras');
    }

    setDetectedFaces(data.faces || []);

    if (data.faces?.length > 0) {
      setSelectedFaceIndex(0);
    } else {
      Alert.alert(
        'Sin caras detectadas',
        'No se han detectado caras en esta imagen previa.'
      );
    }
  } catch (error: any) {
    console.log('Error detectando caras:', error);
    Alert.alert('Error', error?.message || 'No se pudieron detectar caras.');
  } finally {
    setDetectingFaces(false);
  }
}
function formatDate(dateString?: string) {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const time = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) {
    return `Hoy ${time}`;
  }

  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  }) + ` · ${time}`;
}
async function loadPurchaseHistory(userId: string) {
  try {
    const purchasesRef = collection(db, 'users', userId, 'purchaseHistory');

    const purchasesQuery = query(
      purchasesRef,
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(purchasesQuery);

    const purchases = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data(),
    }));

    setPurchaseHistory(purchases);
  } catch (error) {
    console.log('Error cargando historial de compras:', error);
  }
}
  useEffect(() => {
  Purchases.configure({
    apiKey: 'test_nKIwwycKEUdOcwnYObDKSjrWMFI',
  });

  loadProducts();

  const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
    setUser(currentUser);

    if (!currentUser) {
      setTokens(0);
      setPurchaseHistory([]);
       setGenerationHistory([]);
      return;
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      setTokens(data.tokens || 0);
    }
    await loadPurchaseHistory(currentUser.uid);
    await loadGenerationHistory(currentUser.uid);
  });

  return () => unsubscribe();
}, []);

async function loadGenerationHistory(userId: string) {
  try {
    const historyRef = collection(db, 'users', userId, 'history');
    
    const historyQuery = query(
      historyRef,
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(historyQuery);

    const generations = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data(),
    }));

    setGenerationHistory(generations);
  } catch (error) {
    console.log('Error cargando historial de generaciones:', error);
  }
}
async function loadProducts() {
  try {
    setLoadingProducts(true);

    const offerings = await Purchases.getOfferings();

    if (offerings.current) {
      setPackages(offerings.current.availablePackages);
      console.log(
        'RevenueCat packages:',
        offerings.current.availablePackages
      );
    }
  } catch (error) {
    console.log('Error cargando productos RevenueCat:', error);
  } finally {
    setLoadingProducts(false);
  }
}


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
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Necesitamos acceso a tus archivos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes:
    mode === 'image'
      ? ['images']
      : ['videos'],
  allowsEditing: false,
  quality: 0.7,
  videoMaxDuration: 60,
  videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
});

    if (result.canceled) return;

    const asset = result.assets[0];

if (mode === 'image') {
  setTargetFile(asset.uri);
  setTargetType('image');
  setTargetDuration(0);
  setPreviewUri(asset.uri);
  resetResult();

  await detectFaces(asset.uri);

  Alert.alert('Imagen añadida ✅', 'Foto destino seleccionada.');
  return;
}

// MODO VIDEO
const isVideo =
  asset.type === 'video' ||
  asset.mimeType?.includes('video') ||
  asset.fileName?.match(/\.(mp4|mov|m4v)$/i);

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

try {
  const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(
    asset.uri,
    {
      time: 1000,
    }
  );

  setPreviewUri(thumbnailUri);
  await detectFaces(thumbnailUri);
} catch (error) {
  console.log('Error creando thumbnail:', error);
  Alert.alert(
    'Error con el vídeo',
    'No se pudo generar la previsualización del vídeo.'
  );
  return;
}

Alert.alert(
  'Vídeo añadido ✅',
  `Duración aproximada: ${durationSeconds || 10}s · Coste: ${getVideoTokens(
    durationSeconds || 10
  )} tokens`
);
  } catch (error) {
  console.log('Error seleccionando destino:', error);

  if (mode === 'video') {
    Alert.alert(
      'Error con la galería',
      'iOS no ha podido entregar este vídeo desde Fotos. Puedes intentarlo desde Archivos como alternativa.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Abrir Archivos',
          onPress: pickTargetVideoFromFiles,
        },
      ]
    );

    return;
  }

  Alert.alert(
    'Error',
    'No se ha podido cargar el archivo seleccionado.'
  );
}
}
async function pickTargetVideoFromFiles() {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: true,
    });

    if (result.canceled) return;

    const asset = result.assets[0];

    if (!asset?.uri) {
      Alert.alert('Error', 'No se ha podido leer el vídeo seleccionado.');
      return;
    }

    setTargetFile(asset.uri);
    setTargetType('video');
    setTargetDuration(5);
    resetResult();

    Alert.alert(
      'Vídeo añadido ✅',
      `Vídeo destino seleccionado. Coste aproximado: ${getVideoTokens(5)} tokens`
    );
  } catch (error) {
    console.log('Error seleccionando vídeo desde archivos:', error);

    Alert.alert(
      'Error',
      'No se ha podido cargar el vídeo desde Archivos.'
    );
  }
}
  async function convertToJpg(uri: string) {
    const result = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return result.uri;
  }

  async function handleAuth() {
    try {
      if (!email || !password) {
        Alert.alert('Faltan datos', 'Introduce email y contraseña.');
        return;
      }

      if (isLogin) {
        await loginUser(email, password);
        Alert.alert('Bienvenido 🔥', 'Sesión iniciada correctamente.');
      } else {
        await registerUser(email, password);
        Alert.alert('Cuenta creada 🚀', 'Usuario registrado correctamente.');
      }
    } catch (error: any) {
      console.log(error);
      Alert.alert('Error', error?.message || 'Error autenticando.');
    }
  }
  async function handleBuyTokenPack(pack: any) {
  try {
    if (!user?.uid) {
      Alert.alert('Inicia sesión', 'Debes iniciar sesión para comprar tokens.');
      return;
    }

    // MODO PRUEBA:
    // Cuando Apple Developer + RevenueCat estén listos, aquí irá la compra real.
    const purchaseMode = USE_REVENUECAT ? 'revenuecat' : 'test';

    const newTokenBalance = tokens + pack.tokens;

    setTokens(newTokenBalance);

    const userRef = doc(db, 'users', user.uid);

    await updateDoc(userRef, {
      tokens: newTokenBalance,
    });

    await addDoc(collection(db, 'users', user.uid, 'purchaseHistory'), {
      packId: pack.id,
      revenueCatId: pack.revenueCatId,
      packTitle: pack.title,
      tokensAdded: pack.tokens,
      price: pack.price,
      mode: purchaseMode,
      createdAt: new Date().toISOString(),
    });

await loadPurchaseHistory(user.uid);

    Alert.alert(
      'Tokens añadidos ✅',
      `Has añadido ${pack.tokens} tokens.`
    );

    console.log('Pack comprado y guardado:', pack.id, pack.tokens);
  } catch (error) {
    console.log('Error comprando pack:', error);
    Alert.alert(
      'Error',
      'No se han podido añadir los tokens. Inténtalo de nuevo.'
    );
  }
}
  async function generateSwap() {
    if (isGenerating) return;
  setIsGenerating(true);
  setGenerating(true);
    if (!user) {
  Alert.alert(
    'Inicia sesión',
    'Necesitas iniciar sesión para generar imágenes o vídeos.'
  );
  return;
}
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
    `Necesitas ${currentCost} tokens para esta generación.`,
    [
      {
        text: 'Comprar tokens',
        onPress: () => {
          scrollRef.current?.scrollTo({
            y: 650,
            animated: true,
          });
        },
      },
      {
        text: 'Cancelar',
        style: 'cancel',
      },
    ]
  );
  return;
}
if (detectedFaces.length > 0 && selectedFaceIndex === null) {
  Alert.alert(
    'Selecciona una cara',
    'Toca primero la cara que quieres cambiar.'
  );
  setIsGenerating(false);
  setGenerating(false);
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

      formData.append('targetFaceIndex', String(selectedFaceIndex ?? 0));

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

      setCloudinaryPublicId(data.cloudinaryPublicId || null);
      setCloudinaryResourceType(mode === 'image' ? 'image' : 'video');

      const finalUrl =
        data.videoUrl || data.imageUrl || data.resultUrl || data.url;

      if (!data.success || !finalUrl) {
        throw new Error(JSON.stringify(data));
      }

      setResultUrl(finalUrl);
      setResultType(mode);

      setProgress(100);
      setGenerating(false);
      setResultReady(true);
      const newTokenBalance = tokens - currentCost;

setTokens(newTokenBalance);

if (user) {
  const userRef = doc(db, 'users', user.uid);

  await updateDoc(userRef, {
    tokens: newTokenBalance,
  });
}

if (user) {
  await addDoc(collection(db, 'users', user.uid, 'history'), {
    type: mode,
    cost: currentCost,
    resultUrl: finalUrl,
    createdAt: new Date().toISOString(),
  });
  await loadPurchaseHistory(user.uid);
}
      Alert.alert(
        'Resultado listo 🔥',
        mode === 'image'
          ? 'Imagen generada correctamente.'
          : 'Vídeo generado correctamente.'
      );
    } catch (error) {
  console.log(error);
  Alert.alert('Error', cleanError(error));
} finally {
  setIsGenerating(false);
  setGenerating(false);
}
  }

  async function shareResult() {
    try {
      const fileToShare = resultUrl || targetFile;

      if (!fileToShare) {
        Alert.alert('Sin resultado');
        return;
      }

      const permission = await MediaLibrary.requestPermissionsAsync();

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
        FileSystem.documentDirectory + `reelswap-${Date.now()}.${extension}`;

      setStep('Descargando resultado...');
      setGenerating(true);

      const download = await FileSystem.downloadAsync(fileToShare, localUri);

      const asset = await MediaLibrary.createAssetAsync(download.uri);

      try {
        await MediaLibrary.createAlbumAsync('ReelSwap AI', asset, false);
      } catch {
        // Si el álbum ya existe, no pasa nada.
      }

      setGenerating(false);

      const canShare = await Sharing.isAvailableAsync();

      if (!canShare) {
        Alert.alert('Guardado', 'Resultado guardado en galería.');
        return;
      }

      await Sharing.shareAsync(download.uri);

      if (cloudinaryPublicId && cloudinaryResourceType) {
        await fetch(`${BACKEND_URL}/delete-cloudinary-result`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            publicId: cloudinaryPublicId,
            resourceType: cloudinaryResourceType,
          }),
        });
      }

      Alert.alert('Guardado ✅', 'Resultado guardado en galería.');
    } catch (error) {
      console.log(error);
      setGenerating(false);
      Alert.alert('Error', 'No se pudo guardar el resultado.');
    }
  }

  return (
    <ScrollView
  ref={scrollRef}
  style={styles.container}
  contentContainerStyle={styles.content}
>
      {!user && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
          </Text>

          <TextInput
            placeholder="Email"
            placeholderTextColor="#888"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            autoCapitalize="none"
          />

          <TextInput
            placeholder="Contraseña"
            placeholderTextColor="#888"
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            secureTextEntry
          />

          <TouchableOpacity style={styles.generateButton} onPress={handleAuth}>
            <Text style={styles.generateButtonText}>
              {isLogin ? 'Entrar' : 'Crear cuenta'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsLogin(!isLogin)}
            style={{ marginTop: 14 }}
          >
            <Text style={styles.switchAuthText}>
              {isLogin
                ? '¿No tienes cuenta? Crear cuenta'
                : '¿Ya tienes cuenta? Iniciar sesión'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {user && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cuenta</Text>

          <Text style={styles.cardText}>
            Sesión iniciada como {user.email}
          </Text>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={async () => {
              await signOut(auth);
              Alert.alert('Sesión cerrada');
            }}
          >
            <Text style={styles.secondaryButtonText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.hero}>
        <View style={styles.topRow}>
          <Text style={styles.badge}>AI FACE SWAP</Text>

          <View>
  <Text style={styles.tokens}>⚡ {tokens} tokens</Text>
</View>
        </View>

        <Text style={styles.title}>ReelSwap AI</Text>

        {user && (
          <Text style={styles.userEmail}>
            Sesión iniciada: {user.email}
          </Text>
        )}

        <Text style={styles.subtitle}>
          Cambia tu rostro en fotos y vídeos con calidad premium.
        </Text>

        <View style={styles.modeSwitch}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'video' && styles.modeButtonActive]}
            onPress={() => setMode('video')}
          >
            <Text style={[styles.modeText, mode === 'video' && styles.modeTextActive]}>
              Vídeo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeButton, mode === 'image' && styles.modeButtonActive]}
            onPress={() => setMode('image')}
          >
            <Text style={[styles.modeText, mode === 'image' && styles.modeTextActive]}>
              Foto
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={generateSwap}>
          <Text style={styles.buttonText}>✨ Crear ahora · {currentCost} tokens</Text>
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

        {targetFile && (mode === 'image' || previewUri) && (
  <View style={styles.previewWrapper}>
    <Image
      source={{
        uri: mode === 'video' ? previewUri! : previewUri || targetFile,
      }}
      style={styles.preview}
      resizeMode="cover"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setPreviewWidth(width);
        setPreviewHeight(height);
      }}
    />

    {detectedFaces.map((face, index) => {
      const isSelected = selectedFaceIndex === index;

      return (
        <TouchableOpacity
          key={index}
          activeOpacity={0.85}
          onPress={() => setSelectedFaceIndex(index)}
          style={[
            styles.faceBox,
            {
              left: face.x * previewWidth,
              top: face.y * previewHeight,
              width: face.width * previewWidth,
              height: face.height * previewHeight,
            },
            isSelected ? styles.faceBoxSelected : null,
          ]}
        >
          <View style={styles.faceBadge}>
            <Text style={styles.faceBadgeText}>Cara {index + 1}</Text>
          </View>
        </TouchableOpacity>
      );
    })}
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

      <TokenPacks
  packs={TOKEN_PACKS}
  styles={styles}
  onBuyPack={handleBuyTokenPack}
/>

      <GenerateCard
  mode={mode}
  currentCost={currentCost}
  styles={styles}
  onGenerate={generateSwap}
  generating={generating}
/>

      {generating && (
        <View style={styles.loaderCard}>
          <Text style={styles.loaderIcon}>✨</Text>
          <Text style={styles.resultTitle}>{step}</Text>

          <Text style={styles.progressText}>{Math.round(progress)}% completado</Text>

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

          </View>
        </View>
      )}

      <GenerationHistory
  generations={generationHistory}
  styles={styles}
  formatDate={formatDate}
  onOpenPreview={(url, type) => {
    setPreviewUrl(url);
    setPreviewType(type);
  }}
/>
<PurchaseHistory
  purchases={purchaseHistory}
  styles={styles}
  formatDate={formatDate}
/>
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
  input: {
    backgroundColor: '#202033',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: 'white',
    marginTop: 14,
    fontSize: 15,
  },
  switchAuthText: {
    color: '#A78BFA',
    textAlign: 'center',
    fontWeight: '700',
  },
  userEmail: {
    color: '#A78BFA',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
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
  faceSelectorRow: {
  flexDirection: 'row',
  gap: 10,
  marginTop: 14,
},

faceSelectorButton: {
  flex: 1,
  paddingVertical: 12,
  borderRadius: 14,
  backgroundColor: '#1A1A2C',
  alignItems: 'center',
  borderWidth: 1,
  borderColor: '#2A2A3C',
},

faceSelectorButtonActive: {
  borderColor: '#8B5CF6',
  backgroundColor: '#2D1F55',
},

faceSelectorText: {
  color: '#B8B8C8',
  fontWeight: '800',
},

faceSelectorTextActive: {
  color: '#FFFFFF',
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
  generateButtonDisabled: {
  opacity: 0.55,
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
  historyThumbnail: {
  width: 52,
  height: 52,
  borderRadius: 14,
  backgroundColor: '#111',
},

historyVideoThumbnail: {
  width: 52,
  height: 52,
  borderRadius: 14,
  backgroundColor: '#1A1A2C',
  alignItems: 'center',
  justifyContent: 'center',
},

historyVideoIcon: {
  fontSize: 24,
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