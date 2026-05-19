import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
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
  TouchableOpacity,
  View
} from 'react-native';
import Purchases from 'react-native-purchases';
import AuthScreen from '../../components/AuthScreen';
import GenerateCard from '../../components/GenerateCard';
import GenerationHistory from '../../components/GenerationHistory';
import PurchaseHistory from '../../components/PurchaseHistory';
import TokenPacks from '../../components/TokenPacks';
import { APP_CONFIG, getVideoTokens } from '../../constants/appConfig';
import { auth, db } from '../../firebaseConfig';
import { cleanError } from '../../utils/cleanError';
import { formatDate } from '../../utils/formatDate';

type SwapMode = 'image' | 'video';
type ResultType = 'image' | 'video';

type DetectedFace = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};


export default function HomeScreen() {
  const [mode, setMode] = useState<SwapMode>('video');

  const scrollRef = useRef<ScrollView>(null);
  const tokenPacksRef = useRef<View>(null);
  const [tokenPacksY, setTokenPacksY] = useState(0);

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

  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [previewHeight, setPreviewHeight] = useState(0);
  const [previewOriginalWidth, setPreviewOriginalWidth] = useState(0);
  const [previewOriginalHeight, setPreviewOriginalHeight] = useState(0);
  const [detectingFaces, setDetectingFaces] = useState(false);
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
  const [cloudinaryPublicId, setCloudinaryPublicId] = useState<string | null>(null);
  const [cloudinaryResourceType, setCloudinaryResourceType] =
    useState<'image' | 'video' | null>(null);

  const currentCost =
  mode === 'image'
    ? APP_CONFIG.costs.image
    : getVideoTokens(targetDuration);

  const hasEnoughTokens = tokens >= currentCost;

  const generationRequirementsReady =
    !!user &&
    !!faceImage &&
    !!targetFile;

  const canGenerate =
    generationRequirementsReady &&
    hasEnoughTokens &&
    !generating &&
    !isGenerating;

  const canBuyTokensToGenerate =
    generationRequirementsReady &&
    !hasEnoughTokens &&
    !generating &&
    !isGenerating;

  const generateDisabledReason = !user
    ? 'Inicia sesión para generar'
    : !faceImage
      ? 'Selecciona tu rostro'
      : !targetFile
        ? 'Selecciona foto o vídeo destino'
        : !hasEnoughTokens
          ? 'Compra tokens para generar'
          : '';

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

  const historyPreviewPlayer = useVideoPlayer(
    previewType === 'video' && previewUrl ? previewUrl : null,
    (player) => {
      player.loop = true;
    }
  );

  function scrollToTokenPacks() {
    scrollRef.current?.scrollTo({
      y: tokenPacksY,
      animated: true,
    });
  }

  function resetResult() {
    setResultReady(false);
    setResultUrl(null);
    setResultType(null);
    setShowResult(false);
    setCloudinaryPublicId(null);
    setCloudinaryResourceType(null);
  }

  function resetFaceDetectionState() {
    setDetectedFaces([]);
    setSelectedFaceIndex(null);
    setPreviewUri(null);
    setPreviewWidth(0);
    setPreviewHeight(0);
    setPreviewOriginalWidth(0);
    setPreviewOriginalHeight(0);
  }
  async function loadPurchaseHistory(userId: string) {
    try {
      const purchasesRef = collection(db, 'users', userId, 'purchaseHistory');

      const purchasesQuery = query(
        purchasesRef,
        orderBy('createdAt', 'desc'),
        limit(3)
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

  async function loadGenerationHistory(userId: string) {
    try {
      const historyRef = collection(db, 'users', userId, 'history');

      const historyQuery = query(
        historyRef,
        orderBy('createdAt', 'desc'),
        limit(3)
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
        console.log('RevenueCat packages:', offerings.current.availablePackages);
      }
    } catch (error) {
      console.log('Error cargando productos RevenueCat:', error);
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    Purchases.configure({
      apiKey: 'appl_lpIIEFOmMnwcWvPnIhFEZVntErW',
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
      } else {
        await setDoc(userRef, {
          email: currentUser.email || '',
          tokens: APP_CONFIG.initialFreeTokens,
          freeTokensGranted: true,
          createdAt: new Date().toISOString(),
        });

        setTokens(APP_CONFIG.initialFreeTokens);

        await addDoc(collection(db, 'users', currentUser.uid, 'purchaseHistory'), {
          packId: 'free_trial',
          revenueCatId: null,
          packTitle: 'Tokens gratis de bienvenida',
          tokensAdded: APP_CONFIG.initialFreeTokens,
          price: '0 €',
          mode: 'free',
          createdAt: new Date().toISOString(),
        });
      }

      await loadPurchaseHistory(currentUser.uid);
      await loadGenerationHistory(currentUser.uid);
    });

    return () => unsubscribe();
  }, []);

  async function setPreviewSource(uri: string) {
    setPreviewUri(uri);

    try {
      Image.getSize(
        uri,
        (width, height) => {
          setPreviewOriginalWidth(width);
          setPreviewOriginalHeight(height);
        },
        () => {
          setPreviewOriginalWidth(0);
          setPreviewOriginalHeight(0);
        }
      );
    } catch {
      setPreviewOriginalWidth(0);
      setPreviewOriginalHeight(0);
    }
  }

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

      const response = await fetch(`${APP_CONFIG.backendUrl}/detect-faces`, {
        method: 'POST',
        body: formData,
      });

      const rawText = await response.text();
      let data: any = null;

      try {
        data = JSON.parse(rawText);
      } catch (parseError) {
        console.log('Respuesta detect-faces no es JSON:', rawText);
        throw new Error(
          'La API de detección no devolvió JSON. Seguramente el backend aún no tiene /detect-faces.'
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'No se pudieron detectar caras');
      }

      setDetectedFaces(data.faces || []);

      if (data.faces?.length > 0) {
        setSelectedFaceIndex(0);
      } else {
        
      }
    } catch (error: any) {
      console.log('Error detectando caras:', error);
      Alert.alert(
        'Error detectando caras',
        error?.message || 'No se pudieron detectar caras.'
      );
    } finally {
      setDetectingFaces(false);
    }
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
        mediaTypes: mode === 'image' ? ['images'] : ['videos'],
        allowsEditing: false,
        quality: 0.7,
        videoMaxDuration: 60,
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });

      if (result.canceled) return;

      const asset = result.assets[0];

      resetResult();
      resetFaceDetectionState();

      if (mode === 'image') {
        setTargetFile(asset.uri);
        setTargetType('image');
        setTargetDuration(0);

        await setPreviewSource(asset.uri);
        await detectFaces(asset.uri);

        return;
      }

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

      try {
        const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(
          asset.uri,
          { time: 1000 }
        );

        await setPreviewSource(thumbnailUri);
        await detectFaces(thumbnailUri);
      } catch (error) {
        console.log('Error creando thumbnail:', error);
        Alert.alert(
          'Error con el vídeo',
          'No se pudo generar la previsualización del vídeo.'
        );
        return;
      }

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

      Alert.alert('Error', 'No se ha podido cargar el archivo seleccionado.');
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

      resetResult();
      resetFaceDetectionState();

      setTargetFile(asset.uri);
      setTargetType('video');
      setTargetDuration(10);

      try {
        const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(
          asset.uri,
          { time: 1000 }
        );

        await setPreviewSource(thumbnailUri);
        await detectFaces(thumbnailUri);
      } catch (error) {
        console.log('Error creando thumbnail desde Archivos:', error);
      }

      
    } catch (error) {
      console.log('Error seleccionando vídeo desde archivos:', error);

      Alert.alert('Error', 'No se ha podido cargar el vídeo desde Archivos.');
    }
  }

  async function convertToJpg(uri: string) {
    const result = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return result.uri;
  }

  async function handleBuyTokenPack(pack: any) {
    try {
      if (!user?.uid) {
        Alert.alert('Inicia sesión', 'Debes iniciar sesión para comprar tokens.');
        return;
      }
if (APP_CONFIG.useRevenueCat) {
  setLoadingProducts(true);

  const offerings = await Purchases.getOfferings();
  const currentOffering = offerings.current;

  if (!currentOffering) {
    Alert.alert(
      'Productos no disponibles',
      'RevenueCat no ha devuelto ningún offering activo.'
    );
    setLoadingProducts(false);
    return;
  }

  const packageToBuy = currentOffering.availablePackages.find(
    (item) => item.product.identifier === pack.revenueCatId
  );

  if (!packageToBuy) {
    console.log(
      'Packages disponibles:',
      currentOffering.availablePackages.map((item) => item.product.identifier)
    );

    Alert.alert(
      'Producto no encontrado',
      `No se ha encontrado el producto ${pack.revenueCatId} en RevenueCat.`
    );

    setLoadingProducts(false);
    return;
  }

  const purchaseResult = await Purchases.purchasePackage(packageToBuy);

  console.log('Compra RevenueCat OK:', purchaseResult);

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
    mode: 'revenuecat',
    createdAt: new Date().toISOString(),
  });

  await loadPurchaseHistory(user.uid);

  setLoadingProducts(false);

  Alert.alert(
    'Compra completada ✅',
    `Has añadido ${pack.tokens} tokens.`
  );

  return;
}
      const purchaseMode = APP_CONFIG.useRevenueCat ? 'revenuecat' : 'test';
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

      Alert.alert('Tokens añadidos ✅', `Has añadido ${pack.tokens} tokens.`);

      console.log('Pack comprado y guardado:', pack.id, pack.tokens);
    } catch (error: any) {
  console.log('ERROR COMPRA REVENUECAT COMPLETO:', JSON.stringify(error, null, 2));
  console.log('ERROR COMPRA REVENUECAT RAW:', error);

  setLoadingProducts(false);

  Alert.alert(
    'Error compra RevenueCat',
    error?.message ||
      error?.userInfo?.readable_error_code ||
      error?.code ||
      'No se ha podido completar la compra.'
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
      setIsGenerating(false);
      setGenerating(false);
      return;
    }

    if (!faceImage || !targetFile) {
      Alert.alert(
        'Faltan archivos',
        mode === 'image'
          ? 'Sube primero una cara y una foto destino.'
          : 'Sube primero una cara y un vídeo destino.'
      );
      setIsGenerating(false);
      setGenerating(false);
      return;
    }

    if (tokens < currentCost) {
      Alert.alert(
        'Tokens insuficientes',
        `Necesitas ${currentCost} tokens para esta generación.`,
        [
          {
            text: 'Comprar tokens',
            onPress: scrollToTokenPacks,
          },
          {
            text: 'Cancelar',
            style: 'cancel',
          },
        ]
      );
      setIsGenerating(false);
      setGenerating(false);
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

      const apiTargetFaceIndex = selectedFaceIndex ?? 0;

      formData.append('targetFaceIndex', String(apiTargetFaceIndex));
      formData.append('type', mode);

      setProgress(35);
      setStep('Generando con IA...');

      const endpoint = mode === 'image' ? '/imageswap' : '/faceswap';

      const response = await fetch(`${APP_CONFIG.backendUrl}${endpoint}`, {
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

      const finalUrl = data.videoUrl || data.imageUrl || data.resultUrl || data.url;

      if (!data.success || !finalUrl) {
        throw new Error(JSON.stringify(data));
      }

      setResultUrl(finalUrl);
      setResultType(mode);

      setProgress(100);
      setResultReady(true);

      const newTokenBalance = tokens - currentCost;
      setTokens(newTokenBalance);

      if (user) {
        const userRef = doc(db, 'users', user.uid);

        await updateDoc(userRef, {
          tokens: newTokenBalance,
        });

        await addDoc(collection(db, 'users', user.uid, 'history'), {
          type: mode,
          cost: currentCost,
          resultUrl: finalUrl,
          selectedFaceIndex: selectedFaceIndex ?? 0,
          apiTargetFaceIndex,
          detectedFacesCount: detectedFaces.length,
          cloudinaryPublicId: data.cloudinaryPublicId || null,
          cloudinaryResourceType: mode === 'image' ? 'image' : 'video',
          createdAt: new Date().toISOString(),
        });

        await loadGenerationHistory(user.uid);
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
        fileToShare.includes('.mp4') || fileToShare.includes('.mov') ? 'mp4' : 'jpg';

      const baseDirectory =
        FileSystem.documentDirectory || FileSystem.cacheDirectory;

      if (!baseDirectory) {
        Alert.alert('Error', 'No se encontró almacenamiento local.');
        return;
      }

      const localUri = baseDirectory + `reelswap-${Date.now()}.${extension}`;

      setStep('Descargando resultado...');
      setGenerating(true);

      const download = await FileSystem.downloadAsync(fileToShare, localUri);

      const asset = await MediaLibrary.createAssetAsync(download.uri);

      try {
        await MediaLibrary.createAlbumAsync('ReelSwap AI', asset, false);
      } catch {
        // Si ya existe, no pasa nada.
      }

      setGenerating(false);

      const canShare = await Sharing.isAvailableAsync();

      if (!canShare) {
        Alert.alert('Guardado', 'Resultado guardado en galería.');
        return;
      }

      await Sharing.shareAsync(download.uri);

      if (cloudinaryPublicId && cloudinaryResourceType) {
        await fetch(`${APP_CONFIG.backendUrl}/delete-cloudinary-result`, {
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

  function getFaceOverlayStyle(face: DetectedFace) {
    if (
      !previewWidth ||
      !previewHeight ||
      !previewOriginalWidth ||
      !previewOriginalHeight
    ) {
      return {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      };
    }

    const containerRatio = previewWidth / previewHeight;
    const imageRatio = previewOriginalWidth / previewOriginalHeight;

    let displayedWidth = 0;
    let displayedHeight = 0;
    let offsetX = 0;
    let offsetY = 0;

    if (imageRatio > containerRatio) {
      displayedWidth = previewWidth;
      displayedHeight = previewWidth / imageRatio;
      offsetY = (previewHeight - displayedHeight) / 2;
    } else {
      displayedHeight = previewHeight;
      displayedWidth = previewHeight * imageRatio;
      offsetX = (previewWidth - displayedWidth) / 2;
    }

    return {
      left: offsetX + face.x * displayedWidth,
      top: offsetY + face.y * displayedHeight,
      width: face.width * displayedWidth,
      height: face.height * displayedHeight,
    };
  }
if (!user) {
  return (
    <AuthScreen
      email={email}
      password={password}
      isLogin={isLogin}
      styles={styles}
      setEmail={setEmail}
      setPassword={setPassword}
      setIsLogin={setIsLogin}
    />
  );
}
  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
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
              style={[
                styles.modeButton,
                mode === 'video' && styles.modeButtonActive,
              ]}
              onPress={() => {
  setMode('video');
  setTargetFile(null);
  setTargetType(null);
  setTargetDuration(10);
  setStep('');
  setProgress(0);
  resetFaceDetectionState();
  resetResult();
}}
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
              onPress={() => {
  setMode('image');
  setTargetFile(null);
  setTargetType(null);
  setTargetDuration(0);
  setStep('');
  setProgress(0);
  resetFaceDetectionState();
  resetResult();
}}
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

          <TouchableOpacity
            style={[
              styles.button,
              !canGenerate && !canBuyTokensToGenerate ? styles.buttonDisabled : null,
            ]}
            onPress={() => {
              if (canBuyTokensToGenerate) {
                scrollToTokenPacks();
                return;
              }

              if (canGenerate) {
                generateSwap();
              }
            }}
            disabled={!canGenerate && !canBuyTokensToGenerate}
          >
            <Text
              style={[
                styles.buttonText,
                !canGenerate && !canBuyTokensToGenerate ? styles.buttonTextDisabled : null,
              ]}
            >
              {canBuyTokensToGenerate
                ? 'Comprar tokens para generar'
                : canGenerate
                  ? `✨ Crear ahora · ${currentCost} tokens`
                  : generateDisabledReason}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Tu rostro</Text>
          <Text style={styles.cardText}>
            Elige una foto clara de la cara que quieres usar.
          </Text>

          {faceImage && (
            <Image source={{ uri: faceImage }} style={styles.preview} />
          )}

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

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={pickTarget}
          >
            <Text style={styles.secondaryButtonText}>
              {targetFile ? 'Cambiar destino' : 'Seleccionar destino'}
            </Text>
          </TouchableOpacity>

          {mode === 'video' && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={pickTargetVideoFromFiles}
            >
              <Text style={styles.secondaryButtonText}>
                Elegir vídeo desde Archivos
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {previewUri && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>2.1 Selecciona la cara</Text>

            <Text style={styles.cardText}>
              Toca la cara de la foto o del vídeo que quieres sustituir.
            </Text>

            <View
              style={styles.facePreviewContainer}
              onLayout={(event) => {
                setPreviewWidth(event.nativeEvent.layout.width);
                setPreviewHeight(event.nativeEvent.layout.height);
              }}
            >
              <Image
                source={{ uri: previewUri }}
                style={styles.facePreviewImage}
                resizeMode="contain"
              />

              {detectedFaces.map((face, index) => {
                const box = getFaceOverlayStyle(face);
                const isSelected = selectedFaceIndex === index;

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.faceBox,
                      {
                        left: box.left,
                        top: box.top,
                        width: box.width,
                        height: box.height,
                      },
                      isSelected ? styles.faceBoxSelected : null,
                    ]}
                    onPress={() => setSelectedFaceIndex(index)}
                  >
                    <View style={styles.faceBadge}>
                      <Text style={styles.faceBadgeText}>
                        Cara {index + 1}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {detectingFaces ? (
              <Text style={[styles.cardText, { marginTop: 12 }]}>
                Detectando caras...
              </Text>
            ) : detectedFaces.length > 0 ? (
              <Text style={[styles.cardText, { marginTop: 12 }]}>
                Cara seleccionada:{' '}
                {selectedFaceIndex !== null ? selectedFaceIndex + 1 : '-'}
              </Text>
            ) : (
              <Text style={[styles.cardText, { marginTop: 12 }]}>
                No se ha encontrado ninguna cara clara en la vista previa.
              </Text>
            )}
          </View>
        )}

        <View
          ref={tokenPacksRef}
          onLayout={(event) => {
            setTokenPacksY(event.nativeEvent.layout.y);
          }}
        >
          <TokenPacks
          packs={APP_CONFIG.tokenPacks}
          styles={styles}
          onBuyPack={handleBuyTokenPack}
        />
        </View>

        <GenerateCard
          mode={mode}
          currentCost={currentCost}
          styles={styles}
          onGenerate={generateSwap}
          generating={generating}
          canGenerate={canGenerate}
          disabledReason={generateDisabledReason}
          onBuyTokens={scrollToTokenPacks}
          canBuyTokensToGenerate={canBuyTokensToGenerate}
          generationRequirementsReady={generationRequirementsReady}
        />

        {generating && (
          <View style={styles.loaderCard}>
            <Text style={styles.loaderIcon}>✨</Text>
            <Text style={styles.resultTitle}>{step}</Text>

            <Text style={styles.progressText}>
              {Math.round(progress)}% completado
            </Text>

            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${progress}%` }]}
              />
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
                <Image
                  source={{ uri: resultUrl }}
                  style={styles.resultImagePreview}
                />
              ) : (
                <>
                  <Text style={styles.resultPlayIcon}>▶</Text>
                  <Text style={styles.resultPreviewTitle}>Vídeo generado</Text>
                  <Text style={styles.resultPreviewSubtitle}>Toca para verlo</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.resultActions}>
              <TouchableOpacity
                style={styles.resultActionButton}
                onPress={shareResult}
              >
                <Text style={styles.resultActionText}>Compartir</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resultActionButton}
                onPress={() => {
  setFaceImage(null);
  setTargetFile(null);
  setTargetType(null);
  setTargetDuration(mode === 'image' ? 0 : 10);
  setStep('');
  setProgress(0);
  resetFaceDetectionState();
  resetResult();

  scrollRef.current?.scrollTo({
    y: 0,
    animated: true,
  });
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

        <View style={styles.noticeCard}>
  <Text style={styles.noticeTitle}>Uso responsable</Text>
  <Text style={styles.noticeText}>
    Usa solo imágenes y vídeos propios o con permiso. No uses ReelSwapAI para suplantar, engañar o crear contenido sin consentimiento.
  </Text>
        </View>

      </ScrollView>

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

      <Modal visible={!!previewUrl} animationType="slide" transparent={false}>
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              setPreviewUrl(null);
              setPreviewType(null);
            }}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.fullscreenTitle}>Vista previa</Text>

          <View style={styles.fullscreenVideoBox}>
            {previewType === 'image' && previewUrl ? (
              <Image source={{ uri: previewUrl }} style={styles.fullscreenImage} />
            ) : previewType === 'video' && previewUrl ? (
              <VideoView
                player={historyPreviewPlayer}
                style={styles.fullscreenVideo}
                allowsFullscreen
                nativeControls
                contentFit="contain"
              />
            ) : (
              <Text style={styles.fakeResultText}>No hay vista previa</Text>
            )}
          </View>
        </View>
      </Modal>
    </>
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
  buttonDisabled: {
    opacity: 0.45,
  },
  noticeCard: {
  backgroundColor: 'rgba(255,255,255,0.05)',
  borderRadius: 20,
  padding: 16,
  marginTop: 20,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
},
authContainer: {
  flex: 1,
  backgroundColor: '#050509',
  padding: 20,
  justifyContent: 'center',
},

authHero: {
  marginBottom: 28,
},

authTitle: {
  color: 'white',
  fontSize: 44,
  fontWeight: '900',
  marginTop: 18,
},

authSubtitle: {
  color: '#B6B6CA',
  fontSize: 16,
  marginTop: 10,
  lineHeight: 24,
},

authCard: {
  backgroundColor: '#11111C',
  borderRadius: 28,
  padding: 22,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
},
appleButton: {
  width: '100%',
  height: 50,
  marginTop: 14,
},
authLegalText: {
  color: '#777',
  fontSize: 12,
  lineHeight: 18,
  textAlign: 'center',
  marginTop: 18,
},
noticeTitle: {
  color: 'white',
  fontSize: 16,
  fontWeight: '900',
  marginBottom: 6,
},

noticeText: {
  color: '#B6B6CA',
  fontSize: 13,
  lineHeight: 19,
},
  buttonTextDisabled: {
    color: '#777',
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
  facePreviewContainer: {
    marginTop: 16,
    width: '100%',
    height: 320,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  facePreviewImage: {
    width: '100%',
    height: '100%',
  },
  faceBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FACC15',
    backgroundColor: 'rgba(250, 204, 21, 0.12)',
    borderRadius: 12,
  },
  faceBoxSelected: {
    borderColor: '#8B5CF6',
    backgroundColor: 'rgba(139,92,246,0.22)',
  },
  faceBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  faceBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '900',
  },
});