import { randomUUID } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
  saveDeepSwapCallback,
  waitForDeepSwapMaterial,
  waitForDeepSwapTask,
} from './providers/deepswap.js';
import { findDeepSwapDownloadUrl } from './providers/deepswapWeb.js';

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

// Cloudflare R2 (S3 compatible). Cloudinary remains temporarily only for face detection.
const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME;

function extensionFromContentType(contentType = '', fallback = 'bin') {
  const type = contentType.toLowerCase();
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('quicktime')) return 'mov';
  if (type.includes('webm')) return 'webm';
  return fallback;
}

function makeR2Key(folder, filename, contentType, fallbackExtension) {
  const cleanFolder = String(folder || '').replace(/^\/+|\/+$/g, '');
  const cleanFilename = String(filename || `file-${Date.now()}`).replace(/^\/+/, '');
  const hasExtension = /\.[a-z0-9]{2,5}$/i.test(cleanFilename);
  const extension = extensionFromContentType(contentType, fallbackExtension);
  const finalFilename = hasExtension ? cleanFilename : `${cleanFilename}.${extension}`;
  return cleanFolder ? `${cleanFolder}/${finalFilename}` : finalFilename;
}

async function uploadToR2(buffer, { folder, filename, contentType, fallbackExtension = 'bin' }) {
  if (!R2_BUCKET) throw new Error('Falta R2_BUCKET_NAME');

  const key = makeR2Key(folder, filename, contentType, fallbackExtension);

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'private, max-age=0, no-store',
    })
  );

  const signedUrl = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn: 60 * 60 * 2 }
  );

  return { key, signedUrl, contentType };
}

async function getR2SignedUrl(key, expiresIn = 60 * 60 * 2) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn }
  );
}

async function deleteFromR2(key) {
  if (!key) return;

  try {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    console.log('Borrado R2:', key);
  } catch (error) {
    console.log('Error borrando R2:', error);
  }
}

function buildBackendObjectUrl(req, key) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto ? String(forwardedProto).split(',')[0] : req.protocol;
  return `${protocol}://${req.get('host')}/r2-object?key=${encodeURIComponent(key)}`;
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

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ReelSwapAI backend v10 - R2 storage + transición Cloudinary',
  });
});

app.post('/detect-faces', upload.single('target'), async (req, res) => {
  let targetUpload = null;

  try {
    console.log('Nueva petición detect-faces con DeepSwap');

    const targetFile = req.file;

    if (!targetFile) {
      return res.status(400).json({
        success: false,
        error: 'Falta archivo target',
      });
    }

    const isVideo = String(targetFile.mimetype || '').startsWith('video/');

    targetUpload = await uploadToR2(targetFile.buffer, {
      folder: isVideo
        ? 'reelswapai/deepswap/detection-videos'
        : 'reelswapai/deepswap/detection-images',
      filename: `detect-${Date.now()}-${randomUUID()}`,
      contentType:
        targetFile.mimetype ||
        (isVideo ? 'video/mp4' : 'image/jpeg'),
      fallbackExtension: isVideo ? 'mp4' : 'jpg',
    });

    console.log('Detect target R2:', targetUpload.key);

    const materialCreate = await createDeepSwapMaterial(
      targetUpload.signedUrl
    );

    const materialId =
      materialCreate?.materialId ||
      materialCreate?.data?.materialId;

    if (!materialId) {
      throw new Error(
        `DeepSwap no devolvió materialId: ${JSON.stringify(materialCreate)}`
      );
    }

    console.log('DeepSwap DETECT materialId:', materialId);

    const material = await waitForDeepSwapMaterial(materialId);

    const rawFaces =
      material?.faces ||
      material?.data?.faces ||
      [];

    const faces = rawFaces
      .map((face, index) => {
        const id =
          face?.id ??
          face?.faceId ??
          face?.sourceFaceId;

        if (id === undefined || id === null) {
          return null;
        }

        return {
          index,
          id: String(id),
          url:
            face?.url ||
            face?.imageUrl ||
            face?.faceUrl ||
            null,
        };
      })
      .filter(Boolean);

    console.log(
      'DeepSwap DETECT caras:',
      faces.map((face) => ({
        index: face.index,
        id: face.id,
        hasUrl: !!face.url,
      }))
    );

    return res.json({
      success: true,
      provider: 'deepswap',
      materialId: String(materialId),
      faces,
    });
  } catch (error) {
    console.log('ERROR DETECT FACES DEEPSWAP:');
    console.dir(error, { depth: null });

    return res.status(500).json({
      success: false,
      error: error?.message || String(error),
    });
  } finally {
    try {
      if (targetUpload?.key) {
        await deleteFromR2(targetUpload.key);
      }
    } catch (cleanupError) {
      console.error(
        'Error limpiando temporal de detección:',
        cleanupError
      );
    }
  }
});

app.post(
  '/faceswap',
  upload.fields([
    { name: 'face', maxCount: 1 },
    { name: 'target', maxCount: 1 },
  ]),
  async (req, res) => {
    let faceUpload = null;
    let targetUpload = null;

    try {
      console.log('Nueva petición FaceSwap VIDEO DeepSwap');

      const faceFile = req.files?.face?.[0];
      const targetFile = req.files?.target?.[0];
      const targetFaceIndex = Number(req.body?.targetFaceIndex ?? 0);
      const existingMaterialId = req.body?.materialId
        ? String(req.body.materialId)
        : null;
      const requestedSourceFaceId = req.body?.sourceFaceId
        ? String(req.body.sourceFaceId)
        : null;

      console.log('targetFaceIndex VIDEO:', targetFaceIndex);
      console.log('materialId reutilizado VIDEO:', existingMaterialId);
      console.log('sourceFaceId seleccionado VIDEO:', requestedSourceFaceId);

      if (!faceFile) {
        return res.status(400).json({
          success: false,
          error: 'Falta archivo face',
        });
      }

      if (!existingMaterialId && !targetFile) {
        return res.status(400).json({
          success: false,
          error: 'Falta archivo target o materialId',
        });
      }

      faceUpload = await uploadToR2(faceFile.buffer, {
        folder: 'reelswapai/deepswap/video-faces',
        filename: `face-${Date.now()}-${randomUUID()}`,
        contentType: faceFile.mimetype || 'image/jpeg',
        fallbackExtension: 'jpg',
      });

      console.log('Face R2:', faceUpload.key);

      let materialId = existingMaterialId;
      let sourceFaceId = requestedSourceFaceId;

      if (!materialId) {
        targetUpload = await uploadToR2(targetFile.buffer, {
          folder: 'reelswapai/deepswap/video-targets',
          filename: `video-${Date.now()}-${randomUUID()}`,
          contentType: targetFile.mimetype || 'video/mp4',
          fallbackExtension: 'mp4',
        });

        console.log('Video R2:', targetUpload.key);

        const materialCreate = await createDeepSwapMaterial(
          targetUpload.signedUrl
        );

        materialId =
          materialCreate?.materialId ||
          materialCreate?.data?.materialId;

        if (!materialId) {
          throw new Error(
            `DeepSwap no devolvió materialId: ${JSON.stringify(materialCreate)}`
          );
        }
      }

      console.log('DeepSwap VIDEO materialId:', materialId);

      if (!sourceFaceId) {
        const material = await waitForDeepSwapMaterial(materialId);
        const faces = material?.faces || material?.data?.faces || [];

        if (!faces.length) {
          throw new Error(
            `DeepSwap no detectó caras en el vídeo: ${JSON.stringify(material)}`
          );
        }

        console.log('DeepSwap VIDEO caras detectadas:', faces.length);

        const selectedFace = faces[targetFaceIndex] || faces[0];

        sourceFaceId =
          selectedFace?.faceId ??
          selectedFace?.sourceFaceId ??
          selectedFace?.id;
      }

      if (sourceFaceId === undefined || sourceFaceId === null) {
        throw new Error('No se encontró sourceFaceId para el vídeo');
      }

      console.log('DeepSwap VIDEO sourceFaceId:', sourceFaceId);

      const taskCreate = await createDeepSwapTask({
        materialId,
        sourceFaceId,
        targetFaceUrl: faceUpload.signedUrl,
        model: 'shapefusion1.0-fs',
        faceEnhance: true,
      });

      const taskId = taskCreate?.taskId || taskCreate?.data?.taskId;

      if (!taskId) {
        throw new Error(
          `DeepSwap no devolvió taskId: ${JSON.stringify(taskCreate)}`
        );
      }

      console.log('DeepSwap VIDEO taskId:', taskId);

      const task = await waitForDeepSwapTask(taskId);

      let resultUrl =
        task?.videoUrl ||
        task?.resultUrl ||
        task?.data?.videoUrl ||
        task?.data?.resultUrl ||
        null;

      if (!resultUrl) {
        console.log(
          'DeepSwap API sin URL de vídeo. Buscando resultado en la web...'
        );

        resultUrl = await findDeepSwapDownloadUrl({
          taskId,
          materialId,
        });
      }

      if (!resultUrl) {
        throw new Error(
          'No se pudo recuperar el vídeo de DeepSwap'
        );
      }

      console.log('DeepSwap VIDEO resultado final:', resultUrl);

      const resultResponse = await fetch(resultUrl);

      if (!resultResponse.ok) {
        const resultErrorText = await resultResponse.text();
        throw new Error(
          `No se pudo descargar el vídeo generado por DeepSwap: ${resultErrorText}`
        );
      }

      const resultBuffer = Buffer.from(await resultResponse.arrayBuffer());

      const finalUpload = await uploadToR2(resultBuffer, {
        folder: 'reelswapai/results',
        filename: `result-video-${Date.now()}-${randomUUID()}`,
        contentType: resultResponse.headers.get('content-type') || 'video/mp4',
        fallbackExtension: 'mp4',
      });

      console.log('Resultado VIDEO guardado en R2:', finalUpload.key);

      if (faceUpload?.key) {
        await deleteFromR2(faceUpload.key);
      }

      if (targetUpload?.key) {
        await deleteFromR2(targetUpload.key);
      }

      faceUpload = null;
      targetUpload = null;

      return res.json({
        success: true,
        provider: 'deepswap',
        videoUrl: buildBackendObjectUrl(req, finalUpload.key),
        storageKey: finalUpload.key,
        storageProvider: 'r2',
      });
    } catch (error) {
      console.log('ERROR BACKEND VIDEO FULL:');
      console.dir(error, { depth: null });

      return res.status(500).json({
        success: false,
        error: error?.body || error?.message || String(error),
      });
    } finally {
      try {
        if (faceUpload?.key) {
          await deleteFromR2(faceUpload.key);
        }

        if (targetUpload?.key) {
          await deleteFromR2(targetUpload.key);
        }
      } catch (cleanupError) {
        console.error('Error limpiando temporales VIDEO:', cleanupError);
      }
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
    let faceUpload = null;
    let targetUpload = null;

    try {
      console.log('Nueva petición FaceSwap FOTO DeepSwap');

      const faceFile = req.files?.face?.[0];
      const targetFile = req.files?.target?.[0];
      const targetFaceIndex = Number(req.body?.targetFaceIndex ?? 0);
      const existingMaterialId = req.body?.materialId
        ? String(req.body.materialId)
        : null;
      const requestedSourceFaceId = req.body?.sourceFaceId
        ? String(req.body.sourceFaceId)
        : null;

      console.log('targetFaceIndex FOTO:', targetFaceIndex);
      console.log('materialId reutilizado FOTO:', existingMaterialId);
      console.log('sourceFaceId seleccionado FOTO:', requestedSourceFaceId);

      if (!faceFile) {
        return res.status(400).json({
          success: false,
          error: 'Falta archivo face',
        });
      }

      if (!existingMaterialId && !targetFile) {
        return res.status(400).json({
          success: false,
          error: 'Falta archivo target o materialId',
        });
      }

      faceUpload = await uploadToR2(faceFile.buffer, {
        folder: 'reelswapai/deepswap/faces',
        filename: `face-${Date.now()}-${randomUUID()}`,
        contentType: faceFile.mimetype || 'image/jpeg',
        fallbackExtension: 'jpg',
      });

      console.log('Face R2:', faceUpload.key);

      let materialId = existingMaterialId;
      let sourceFaceId = requestedSourceFaceId;

      if (!materialId) {
        targetUpload = await uploadToR2(targetFile.buffer, {
          folder: 'reelswapai/deepswap/targets',
          filename: `target-${Date.now()}-${randomUUID()}`,
          contentType: targetFile.mimetype || 'image/jpeg',
          fallbackExtension: 'jpg',
        });

        console.log('Target R2:', targetUpload.key);

        const materialCreate = await createDeepSwapMaterial(
          targetUpload.signedUrl
        );

        materialId =
          materialCreate?.materialId ||
          materialCreate?.data?.materialId;

        if (!materialId) {
          throw new Error(
            `DeepSwap no devolvió materialId: ${JSON.stringify(materialCreate)}`
          );
        }
      }

      console.log('DeepSwap IMAGE materialId:', materialId);

      if (!sourceFaceId) {
        const material = await waitForDeepSwapMaterial(materialId);
        const faces = material?.faces || material?.data?.faces || [];

        if (!faces.length) {
          throw new Error(
            `DeepSwap no detectó caras en el target: ${JSON.stringify(material)}`
          );
        }

        console.log('DeepSwap IMAGE caras detectadas:', faces.length);

        const selectedFace = faces[targetFaceIndex] || faces[0];

        sourceFaceId =
          selectedFace?.faceId ??
          selectedFace?.sourceFaceId ??
          selectedFace?.id;
      }

      if (sourceFaceId === undefined || sourceFaceId === null) {
        throw new Error('No se encontró sourceFaceId para la imagen');
      }

      console.log('DeepSwap IMAGE sourceFaceId:', sourceFaceId);

      const taskCreate = await createDeepSwapTask({
        materialId,
        sourceFaceId,
        targetFaceUrl: faceUpload.signedUrl,
        model: 'shapefusion1.0-fs',
        faceEnhance: true,
      });

      const taskId = taskCreate?.taskId || taskCreate?.data?.taskId;

      if (!taskId) {
        throw new Error(
          `DeepSwap no devolvió taskId: ${JSON.stringify(taskCreate)}`
        );
      }

      console.log('DeepSwap IMAGE taskId:', taskId);

      const task = await waitForDeepSwapTask(taskId);

      let resultUrl =
        task?.imageUrl ||
        task?.videoUrl ||
        task?.resultUrl ||
        task?.data?.imageUrl ||
        task?.data?.videoUrl ||
        task?.data?.resultUrl ||
        (Array.isArray(task?.imageUrls) ? task.imageUrls[0] : null);

      if (!resultUrl) {
        console.log(
          'DeepSwap API sin URL. Buscando resultado en la web...'
        );

        resultUrl = await findDeepSwapDownloadUrl({
          taskId,
          materialId,
        });
      }

      if (!resultUrl) {
        throw new Error(
          'No se pudo recuperar el resultado de DeepSwap'
        );
      }

      console.log('DeepSwap IMAGE resultado final:', resultUrl);

      const resultResponse = await fetch(resultUrl);

      if (!resultResponse.ok) {
        const resultErrorText = await resultResponse.text();
        throw new Error(
          `No se pudo descargar la imagen generada por DeepSwap: ${resultErrorText}`
        );
      }

      const resultBuffer = Buffer.from(await resultResponse.arrayBuffer());

      const finalUpload = await uploadToR2(resultBuffer, {
        folder: 'reelswapai/results',
        filename: `result-image-${Date.now()}-${randomUUID()}`,
        contentType: resultResponse.headers.get('content-type') || 'image/jpeg',
        fallbackExtension: 'jpg',
      });

      console.log('Resultado FOTO guardado en R2:', finalUpload.key);

      if (faceUpload?.key) {
        await deleteFromR2(faceUpload.key);
      }

      if (targetUpload?.key) {
        await deleteFromR2(targetUpload.key);
      }

      faceUpload = null;
      targetUpload = null;

      return res.json({
        success: true,
        provider: 'deepswap',
        imageUrl: buildBackendObjectUrl(req, finalUpload.key),
        storageKey: finalUpload.key,
        storageProvider: 'r2',
      });
    } catch (error) {
      console.log('ERROR BACKEND IMAGE FULL:');
      console.dir(error, { depth: null });

      return res.status(500).json({
        success: false,
        error: error?.body || error?.message || String(error),
      });
    } finally {
      try {
        if (faceUpload?.key) {
          await deleteFromR2(faceUpload.key);
        }

        if (targetUpload?.key) {
          await deleteFromR2(targetUpload.key);
        }
      } catch (cleanupError) {
        console.error('Error limpiando temporales FOTO:', cleanupError);
      }
    }
  }
);

app.post('/delete-r2-result', async (req, res) => {
  try {
    const { storageKey } = req.body;

    if (!storageKey) {
      return res.status(400).json({
        success: false,
        error: 'Falta storageKey',
      });
    }

    await deleteFromR2(storageKey);

    return res.json({ success: true });
  } catch (error) {
    console.log('Error endpoint delete-r2-result:', error);

    return res.status(500).json({
      success: false,
      error: error?.message || error,
    });
  }
});

// Compatibilidad temporal con versiones antiguas de la app.
app.post('/delete-cloudinary-result', async (req, res) => {
  try {
    const { publicId, resourceType } = req.body;
    if (!publicId || !resourceType) {
      return res.status(400).json({ success: false, error: 'Faltan publicId o resourceType' });
    }
    await deleteFromCloudinary(publicId, resourceType);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || error });
  }
});

// URL estable de lectura para la app y el historial. El bucket puede seguir privado.
app.get('/r2-object', async (req, res) => {
  try {
    const key = String(req.query.key || '');
    if (!key) {
      return res.status(400).json({ success: false, error: 'Falta key' });
    }

    const range = req.headers.range;
    const object = await r2.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ...(range ? { Range: range } : {}),
      })
    );

    if (object.ContentType) res.setHeader('Content-Type', object.ContentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');

    if (object.ContentRange) {
      res.status(206);
      res.setHeader('Content-Range', object.ContentRange);
    }
    if (object.ContentLength !== undefined) {
      res.setHeader('Content-Length', String(object.ContentLength));
    }

    object.Body.pipe(res);
  } catch (error) {
    console.log('Error leyendo objeto R2:', error);
    return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
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
app.post(
  '/deepswap-callback',
  express.json({ limit: '10mb' }),
  (req, res) => {
    try {
      console.log('DEEPSWAP CALLBACK RECIBIDO');

      console.log(
        JSON.stringify(req.body, null, 2)
      );

      const taskId = saveDeepSwapCallback(
        req.body
      );

      console.log(
        'Callback DeepSwap guardado para taskId:',
        taskId
      );

      return res.json({
        success: true,
      });
    } catch (error) {
      console.error(
        'ERROR DEEPSWAP CALLBACK:',
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error?.message ||
          String(error),
      });
    }
  }
);

app.post(
  '/deepswap-video-test',
  upload.fields([
    { name: 'face', maxCount: 1 },
    { name: 'target', maxCount: 1 },
  ]),
  async (req, res) => {
    let faceUpload = null;
    let targetUpload = null;

    try {
      console.log('Nueva petición DeepSwap VIDEO TEST');

      const faceFile = req.files?.face?.[0];
      const targetFile = req.files?.target?.[0];

      if (!faceFile || !targetFile) {
        return res.status(400).json({
          success: false,
          error: 'Faltan face o target',
        });
      }

      // 1. Subir cara y vídeo temporalmente a R2
      faceUpload = await uploadToR2(faceFile.buffer, {
        folder: 'reelswapai/deepswap/video-faces',
        filename: `face-${Date.now()}-${randomUUID()}`,
        contentType: faceFile.mimetype || 'image/jpeg',
        fallbackExtension: 'jpg',
      });

      targetUpload = await uploadToR2(targetFile.buffer, {
        folder: 'reelswapai/deepswap/video-targets',
        filename: `video-${Date.now()}-${randomUUID()}`,
        contentType: targetFile.mimetype || 'video/mp4',
        fallbackExtension: 'mp4',
      });

      console.log('Face R2:', faceUpload.key);
      console.log('Video R2:', targetUpload.key);

      // 3. Crear material DeepSwap con URL firmada de R2
      const materialCreate = await createDeepSwapMaterial(
        targetUpload.signedUrl
      );

      const materialId =
        materialCreate?.materialId ||
        materialCreate?.data?.materialId;

      if (!materialId) {
        throw new Error(
          `DeepSwap no devolvió materialId: ${JSON.stringify(materialCreate)}`
        );
      }

      console.log('DeepSwap VIDEO materialId:', materialId);

      // 4. Esperar al análisis del vídeo
      const material = await waitForDeepSwapMaterial(materialId);

      const faces =
        material?.faces ||
        material?.data?.faces ||
        [];

      if (!faces.length) {
        throw new Error(
          `DeepSwap no detectó caras en el vídeo: ${JSON.stringify(material)}`
        );
      }

      const sourceFaceId = faces[0]?.id;

      if (!sourceFaceId) {
        throw new Error(
          `No se encontró sourceFaceId: ${JSON.stringify(faces[0])}`
        );
      }

      console.log('DeepSwap VIDEO sourceFaceId:', sourceFaceId);

      // 5. Crear face swap
      const taskCreate = await createDeepSwapTask({
        materialId,
        sourceFaceId,
        targetFaceUrl: faceUpload.signedUrl,
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

      console.log('DeepSwap VIDEO taskId:', taskId);

      // 6. Esperar resultado
      const task = await waitForDeepSwapTask(taskId);

      const resultUrl =
        task?.videoUrl ||
        task?.data?.videoUrl;

      if (!resultUrl) {
        throw new Error(
          `DeepSwap no devolvió videoUrl: ${JSON.stringify(task)}`
        );
      }

      console.log('DeepSwap VIDEO resultado:', resultUrl);

      return res.json({
        success: true,
        provider: 'deepswap',
        materialId,
        taskId,
        resultUrl,
      });
    } catch (error) {
      console.error('ERROR DEEPSWAP VIDEO TEST:', error);

      return res.status(500).json({
        success: false,
        error: error?.message || String(error),
      });
    } finally {
      try {
        if (faceUpload?.key) {
          await deleteFromR2(faceUpload.key);
        }

        if (targetUpload?.key) {
          await deleteFromR2(targetUpload.key);
        }
      } catch (cleanupError) {
        console.error(
          'Error limpiando temporales DeepSwap VIDEO:',
          cleanupError
        );
      }
    }
  }
);
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

      faceUpload = await uploadToR2(faceFile.buffer, {
        folder: 'reelswapai/deepswap/faces',
        filename: `face-${Date.now()}-${randomUUID()}`,
        contentType: faceFile.mimetype || 'image/jpeg',
        fallbackExtension: 'jpg',
      });

      targetUpload = await uploadToR2(targetFile.buffer, {
        folder: 'reelswapai/deepswap/targets',
        filename: `target-${Date.now()}-${randomUUID()}`,
        contentType: targetFile.mimetype || 'image/jpeg',
        fallbackExtension: 'jpg',
      });

      console.log('Face R2:', faceUpload.key);
      console.log('Target R2:', targetUpload.key);

      // 3. Crear material en DeepSwap con URL firmada de R2
      const materialCreate = await createDeepSwapMaterial(
        targetUpload.signedUrl
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
        targetFaceUrl: faceUpload.signedUrl,
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

     const resultUrl =
  task?.imageUrl ||
  task?.videoUrl ||
  task?.resultUrl ||
  task?.data?.imageUrl ||
  task?.data?.videoUrl ||
  task?.data?.resultUrl ||
  (Array.isArray(task?.imageUrls) ? task.imageUrls[0] : null);

if (!resultUrl) {
  throw new Error(
    `DeepSwap no devolvió URL final: ${JSON.stringify(task)}`
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
        if (faceUpload?.key) {
          await deleteFromR2(faceUpload.key);
        }

        if (targetUpload?.key) {
          await deleteFromR2(targetUpload.key);
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