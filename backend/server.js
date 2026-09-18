import { v2 as cloudinary } from 'cloudinary';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import multer from 'multer';
import { Agent, setGlobalDispatcher } from 'undici';
import {
  createDeepSwapMaterial,
  createDeepSwapTask,
  waitForDeepSwapMaterial,
  waitForDeepSwapTask,
} from './providers/deepswap.js';

dotenv.config();

// Firebase Admin
const firebaseServiceAccountBase64 =
  process.env.FIREBASE_SERVICE_ACCOUNT_B64;

if (!firebaseServiceAccountBase64) {
  throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_B64');
}

const firebaseServiceAccount = JSON.parse(
  Buffer.from(firebaseServiceAccountBase64, 'base64').toString('utf8')
);

if (getApps().length === 0) {
  initializeApp({
    credential: cert(firebaseServiceAccount),
  });
}

const adminAuth = getAuth();
const adminDb = getFirestore();

console.log('Firebase Admin inicializado correctamente');

async function requireFirebaseAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No autorizado',
      });
    }

    const idToken = authHeader.substring(7);

    const decodedToken = await adminAuth.verifyIdToken(idToken);

    req.firebaseUser = decodedToken;

    next();
  } catch (error) {
    console.error('Error verificando Firebase token:', error?.message || error);

    return res.status(401).json({
      success: false,
      error: 'Token de autenticación inválido',
    });
  }
}

async function deleteCollectionInBatches(collectionRef) {
  while (true) {
    const snapshot = await collectionRef.limit(400).get();

    if (snapshot.empty) {
      break;
    }

    const batch = adminDb.batch();

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }
}

setGlobalDispatcher(
  new Agent({
    headersTimeout: 10 * 60 * 1000,
    bodyTimeout: 10 * 60 * 1000,
  })
);

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const PIAPI_TASK_URL = 'https://api.piapi.ai/api/v1/task';

function uploadToCloudinary(buffer, resourceType, folder, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder,
        public_id: filename,
        overwrite: true,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(buffer);
  });
}

function uploadImageToCloudinaryForPiapi(buffer, folder, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder,
        public_id: filename,
        overwrite: true,
        transformation: [
          {
            width: 2048,
            height: 2048,
            crop: 'limit',
          },
        ],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(buffer);
  });
}

function uploadVideoToCloudinaryForPiapi(buffer, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'video',
        folder: 'reelswapai/targets',
        public_id: filename,
        overwrite: true,
        transformation: [
          {
            width: 720,
            height: 1280,
            crop: 'limit',
            format: 'mp4',
          },
        ],
        format: 'mp4',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(buffer);
  });
}

function uploadToCloudinaryWithFaces(buffer, folder, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder,
        public_id: filename,
        overwrite: true,
        faces: true,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(buffer);
  });
}

async function deleteFromCloudinary(publicId, resourceType) {
  try {
    if (!publicId) return;

    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });

    console.log('Borrado Cloudinary:', publicId);
    console.log('Tipo recurso:', resourceType);
  } catch (error) {
    console.log('Error borrando Cloudinary:', error);
  }
}

function buildPiapiVideoUrl(url) {
  return url
    .replace('/upload/', '/upload/w_720,h_1280,c_limit,f_mp4/')
    .replace(/\.(mov|MOV|webm|WEBM|m4v|M4V)$/, '.mp4');
}

async function createPiapiTask(payload) {
  console.log('Creando tarea PiAPI...');
  console.dir(payload, { depth: null });

  const response = await fetch(PIAPI_TASK_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.PIAPI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  console.log('PiAPI create status:', response.status);
  console.log('PiAPI create response:', text);

  if (!response.ok) {
    throw new Error(text);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`PiAPI no devolvió JSON válido: ${text}`);
  }

  const taskId = data?.data?.task_id || data?.task_id;

  if (!taskId) {
    throw new Error(`No se encontró task_id en PiAPI: ${text}`);
  }

  return taskId;
}

async function getPiapiTask(taskId) {
  const response = await fetch(`${PIAPI_TASK_URL}/${taskId}`, {
    method: 'GET',
    headers: {
      'x-api-key': process.env.PIAPI_API_KEY,
    },
  });

  const text = await response.text();
  console.log('PiAPI get status:', response.status);
  console.log('PiAPI get response:', text);

  if (!response.ok) {
    throw new Error(text);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`PiAPI get no devolvió JSON válido: ${text}`);
  }
}

async function waitForPiapiTask(taskId) {
  const maxAttempts = 90;
  const delayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Consultando PiAPI intento ${attempt}/${maxAttempts}`);

    const result = await getPiapiTask(taskId);
    const status = String(
      result?.data?.status ||
        result?.status ||
        result?.data?.state ||
        result?.state ||
        ''
    ).toLowerCase();

    console.log('Estado PiAPI:', status);

    const outputUrl = findOutputUrlFromPiapiResult(result);

    if (
      outputUrl &&
      ['completed', 'complete', 'success', 'succeeded', 'finished'].some((s) =>
        status.includes(s)
      )
    ) {
      return result;
    }

    if (outputUrl && !['pending', 'processing', 'running', 'queued'].includes(status)) {
      return result;
    }

    if (['failed', 'fail', 'error', 'cancelled', 'canceled'].some((s) => status.includes(s))) {
      throw new Error(`PiAPI falló: ${JSON.stringify(result)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Timeout esperando resultado de PiAPI');
}

function findOutputUrlFromPiapiResult(result) {
  return (
    result?.data?.output?.video_url ||
    result?.data?.output?.image_url ||
    result?.data?.output?.url ||
    result?.data?.output?.output_url ||
    result?.data?.output?.[0]?.url ||
    result?.data?.output?.[0] ||
    result?.output?.video_url ||
    result?.output?.image_url ||
    result?.output?.url ||
    result?.url ||
    null
  );
}

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ReelSwapAI backend funcionando v9 con PiAPI foto y video',
  });
});

app.post('/detect-faces', upload.single('target'), async (req, res) => {
  try {
    console.log('Nueva petición detect-faces');

    const targetFile = req.file;

    if (!targetFile) {
      return res.status(400).json({
        success: false,
        error: 'Falta archivo target',
      });
    }

    const uploadResult = await uploadToCloudinaryWithFaces(
      targetFile.buffer,
      'reelswapai/face-detection',
      `detect-${Date.now()}`
    );

    console.log('Cloudinary detect result:', {
      public_id: uploadResult.public_id,
      width: uploadResult.width,
      height: uploadResult.height,
      faces: uploadResult.faces,
    });

    const facesRaw = uploadResult.faces || [];
    const imageWidth = uploadResult.width || 1;
    const imageHeight = uploadResult.height || 1;

    const faces = facesRaw
      .map((face, index) => {
        const [x, y, width, height] = face;

        return {
          index,
          x: x / imageWidth,
          y: y / imageHeight,
          width: width / imageWidth,
          height: height / imageHeight,
          area: width * height,
        };
      })
      .sort((a, b) => b.area - a.area)
      .map((face, index) => ({
        index,
        x: face.x,
        y: face.y,
        width: face.width,
        height: face.height,
      }));

    await deleteFromCloudinary(uploadResult.public_id, 'image');

    return res.json({
      success: true,
      faces,
    });
  } catch (error) {
    console.log('ERROR DETECT FACES:');
    console.dir(error, { depth: null });

    return res.status(500).json({
      success: false,
      error: error?.message || error,
    });
  }
});

app.post(
  '/faceswap',
  upload.fields([
    { name: 'face', maxCount: 1 },
    { name: 'target', maxCount: 1 },
  ]),
  async (req, res) => {
    let faceUpload;
    let targetUpload;

    try {
      console.log('Nueva petición FaceSwap VIDEO PiAPI');

      const faceFile = req.files?.face?.[0];
      const targetFile = req.files?.target?.[0];

      if (!faceFile || !targetFile) {
        return res.status(400).json({
          success: false,
          error: 'Faltan archivos face o target',
        });
      }

      faceUpload = await uploadImageToCloudinaryForPiapi(
        faceFile.buffer,
        'reelswapai/faces',
        `face-${Date.now()}`
      );

      targetUpload = await uploadVideoToCloudinaryForPiapi(
        targetFile.buffer,
        `target-video-${Date.now()}`
      );

      const piapiVideoUrl = targetUpload.secure_url;

      console.log('Face subida:', faceUpload.secure_url);
      console.log('Video subido:', targetUpload.secure_url);
      console.log('Video PiAPI URL:', piapiVideoUrl);

      const taskId = await createPiapiTask({
        model: 'Qubico/video-toolkit',
        task_type: 'face-swap',
        input: {
          swap_image: faceUpload.secure_url,
          target_video: piapiVideoUrl,
          swap_faces_index: '0',
          target_faces_index: '0',
        },
      });

      console.log('PiAPI taskId vídeo:', taskId);

      const piapiResult = await waitForPiapiTask(taskId);

      console.log('Resultado completo PiAPI vídeo:');
      console.dir(piapiResult, { depth: null });

      const resultUrl = findOutputUrlFromPiapiResult(piapiResult);

      console.log('URL resultado PiAPI vídeo:', resultUrl);

      if (!resultUrl) {
        await deleteFromCloudinary(faceUpload.public_id, 'image');
        await deleteFromCloudinary(targetUpload.public_id, 'video');

        return res.status(500).json({
          success: false,
          error: 'No se encontró URL de vídeo en respuesta de PiAPI',
          data: piapiResult,
        });
      }

      const resultResponse = await fetch(resultUrl);

      if (!resultResponse.ok) {
        const resultErrorText = await resultResponse.text();

        await deleteFromCloudinary(faceUpload.public_id, 'image');
        await deleteFromCloudinary(targetUpload.public_id, 'video');

        return res.status(500).json({
          success: false,
          error: 'No se pudo descargar el vídeo generado por PiAPI',
          details: resultErrorText,
        });
      }

      const resultBuffer = Buffer.from(await resultResponse.arrayBuffer());

      const finalUpload = await uploadToCloudinary(
        resultBuffer,
        'video',
        'reelswapai/results',
        `result-video-${Date.now()}`
      );

      await deleteFromCloudinary(faceUpload.public_id, 'image');
      await deleteFromCloudinary(targetUpload.public_id, 'video');

      return res.json({
        success: true,
        videoUrl: finalUpload.secure_url,
        cloudinaryPublicId: finalUpload.public_id,
        cloudinaryResourceType: 'video',
      });
    } catch (error) {
      console.log('ERROR BACKEND VIDEO FULL:');
      console.dir(error, { depth: null });

      if (faceUpload?.public_id) {
        await deleteFromCloudinary(faceUpload.public_id, 'image');
      }

      if (targetUpload?.public_id) {
        await deleteFromCloudinary(targetUpload.public_id, 'video');
      }

      return res.status(500).json({
        success: false,
        error: error?.body || error?.message || error,
      });
    }
  }
);

app.post(
  '/imageswap',
  upload.fields([
    { name: 'face', maxCount: 1 },
    { name: 'target', maxCount: 1 },
  ]),
  async (req, res) => {
    let faceUpload;
    let targetUpload;

    try {
      console.log('Nueva petición FaceSwap FOTO Segmind');

      const faceFile = req.files?.face?.[0];
      const targetFile = req.files?.target?.[0];
      const targetFaceIndex = Number(req.body?.targetFaceIndex ?? 0);

      console.log('targetFaceIndex FOTO:', targetFaceIndex);

      if (!faceFile || !targetFile) {
        return res.status(400).json({
          success: false,
          error: 'Faltan archivos face o target',
        });
      }

      faceUpload = await uploadToCloudinary(
        faceFile.buffer,
        'image',
        'reelswapai/faces',
        `face-${Date.now()}`
      );

      targetUpload = await uploadToCloudinary(
        targetFile.buffer,
        'image',
        'reelswapai/targets',
        `target-image-${Date.now()}`
      );

      const response = await fetch(
        'https://api.segmind.com/v1/hyperswap-image-faceswap-by-facefusion-labs',
        {
          method: 'POST',
          headers: {
            'x-api-key': process.env.SEGMIND_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source_image: faceUpload.secure_url,
            target_image: targetUpload.secure_url,
            face_selector_mode: 'reference',
            face_selector_order: 'large-small',
            face_selector_age_start: 0,
            face_selector_age_end: 100,
            target_face_index: targetFaceIndex,
            reference_face_distance: 0.6,
            reference_frame_number: 1,
            base64: false,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Segmind image error:', errorText);

        await deleteFromCloudinary(faceUpload.public_id, 'image');
        await deleteFromCloudinary(targetUpload.public_id, 'image');

        return res.status(500).json({
          success: false,
          error: errorText,
        });
      }

      const resultBuffer = Buffer.from(await response.arrayBuffer());

      const finalUpload = await uploadToCloudinary(
        resultBuffer,
        'image',
        'reelswapai/results',
        `result-image-${Date.now()}`
      );

      await deleteFromCloudinary(faceUpload.public_id, 'image');
      await deleteFromCloudinary(targetUpload.public_id, 'image');

      return res.json({
        success: true,
        imageUrl: finalUpload.secure_url,
        cloudinaryPublicId: finalUpload.public_id,
        cloudinaryResourceType: 'image',
      });
    } catch (error) {
      console.log('ERROR BACKEND IMAGE FULL:');
      console.dir(error, { depth: null });

      if (faceUpload?.public_id) {
        await deleteFromCloudinary(faceUpload.public_id, 'image');
      }

      if (targetUpload?.public_id) {
        await deleteFromCloudinary(targetUpload.public_id, 'image');
      }

      return res.status(500).json({
        success: false,
        error: error?.body || error?.message || error,
      });
    }
  }
);

app.post('/delete-cloudinary-result', async (req, res) => {
  try {
    const { publicId, resourceType } = req.body;

    if (!publicId || !resourceType) {
      return res.status(400).json({
        success: false,
        error: 'Faltan publicId o resourceType',
      });
    }

    await deleteFromCloudinary(publicId, resourceType);

    return res.json({
      success: true,
    });
  } catch (error) {
    console.log('Error endpoint delete-cloudinary-result:', error);

    return res.status(500).json({
      success: false,
      error: error?.message || error,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.delete('/delete-account', requireFirebaseAuth, async (req, res) => {
  try {
    const uid = req.firebaseUser.uid;

    console.log('Eliminando cuenta:', uid);

    const userRef = adminDb.collection('users').doc(uid);

    // Borrar historial de generaciones
    await deleteCollectionInBatches(
      userRef.collection('history')
    );

    // Borrar historial de compras
    await deleteCollectionInBatches(
      userRef.collection('purchaseHistory')
    );

    // Borrar documento principal del usuario
    await userRef.delete();

    // Borrar usuario de Firebase Authentication
    try {
      await adminAuth.deleteUser(uid);
    } catch (authError) {
      if (authError?.code !== 'auth/user-not-found') {
        throw authError;
      }
    }

    console.log('Cuenta eliminada correctamente:', uid);

    return res.json({
      success: true,
      message: 'Cuenta eliminada correctamente',
    });
  } catch (error) {
    console.error(
      'ERROR DELETE ACCOUNT:',
      error?.message || error
    );

    return res.status(500).json({
      success: false,
      error: 'No se ha podido eliminar la cuenta',
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor funcionando en puerto ${PORT}`);
});
app.post(
  '/deepswap-image-test',
  upload.fields([
    { name: 'face', maxCount: 1 },
    { name: 'target', maxCount: 1 },
  ]),
  async (req, res) => {
    let faceUpload = null;
    let targetUpload = null;

    try {
      console.log('Nueva petición DeepSwap FOTO TEST');

      const faceFile = req.files?.face?.[0];
      const targetFile = req.files?.target?.[0];

      if (!faceFile || !targetFile) {
        return res.status(400).json({
          success: false,
          error: 'Faltan face o target',
        });
      }

      // 1. Subir cara a Cloudinary
      faceUpload = await uploadToCloudinary(
        faceFile.buffer,
        'reelswapai/deepswap/faces',
        'image'
      );

      // 2. Subir imagen destino a Cloudinary
      targetUpload = await uploadToCloudinary(
        targetFile.buffer,
        'reelswapai/deepswap/targets',
        'image'
      );

      console.log('Face URL:', faceUpload.secure_url);
      console.log('Target URL:', targetUpload.secure_url);

      // 3. Crear material en DeepSwap con la imagen target
      const materialCreate = await createDeepSwapMaterial(
        targetUpload.secure_url
      );

      const materialId =
        materialCreate?.materialId ||
        materialCreate?.data?.materialId;

      if (!materialId) {
        throw new Error(
          `DeepSwap no devolvió materialId: ${JSON.stringify(materialCreate)}`
        );
      }

      console.log('DeepSwap materialId:', materialId);

      // 4. Esperar preprocessing
      const material = await waitForDeepSwapMaterial(materialId);

      const faces =
        material?.faces ||
        material?.data?.faces ||
        [];

      if (!faces.length) {
        throw new Error(
          `DeepSwap no detectó caras en el target: ${JSON.stringify(material)}`
        );
      }

      // Para esta primera prueba cogemos la primera cara detectada
      const sourceFaceId =
        faces[0]?.faceId ||
        faces[0]?.sourceFaceId ||
        faces[0]?.id;

      if (sourceFaceId === undefined || sourceFaceId === null) {
        throw new Error(
          `No se encontró sourceFaceId: ${JSON.stringify(faces[0])}`
        );
      }

      console.log('DeepSwap sourceFaceId:', sourceFaceId);

      // 5. Crear tarea de face swap
      const taskCreate = await createDeepSwapTask({
        materialId,
        sourceFaceId,
        targetFaceUrl: faceUpload.secure_url,
        model: 'shapefusion1.0-fs',
        faceEnhance: true,
      });

      const taskId =
        taskCreate?.taskId ||
        taskCreate?.data?.taskId;

      if (!taskId) {
        throw new Error(
          `DeepSwap no devolvió taskId: ${JSON.stringify(taskCreate)}`
        );
      }

      console.log('DeepSwap taskId:', taskId);

      // 6. Esperar resultado
      const task = await waitForDeepSwapTask(taskId);

      const imageUrls =
        task?.imageUrls ||
        task?.data?.imageUrls ||
        task?.result?.imageUrls ||
        [];

      const resultUrl = imageUrls?.[0];

      if (!resultUrl) {
        throw new Error(
          `DeepSwap no devolvió imageUrls: ${JSON.stringify(task)}`
        );
      }

      console.log('DeepSwap resultado:', resultUrl);

      return res.json({
        success: true,
        provider: 'deepswap',
        materialId,
        taskId,
        resultUrl,
      });
    } catch (error) {
      console.error('ERROR DEEPSWAP IMAGE TEST:', error);

      return res.status(500).json({
        success: false,
        error: error?.message || String(error),
      });
    } finally {
      try {
        if (faceUpload?.public_id) {
          await deleteFromCloudinary(faceUpload.public_id, 'image');
        }

        if (targetUpload?.public_id) {
          await deleteFromCloudinary(targetUpload.public_id, 'image');
        }
      } catch (cleanupError) {
        console.error(
          'Error limpiando temporales DeepSwap:',
          cleanupError
        );
      }
    }
  }
);