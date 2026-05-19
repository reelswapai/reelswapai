import { fal } from '@fal-ai/client';
import { v2 as cloudinary } from 'cloudinary';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { Agent, setGlobalDispatcher } from 'undici';

dotenv.config();

setGlobalDispatcher(
  new Agent({
    headersTimeout: 10 * 60 * 1000,
    bodyTimeout: 10 * 60 * 1000,
  })
);

fal.config({
  credentials: process.env.FAL_KEY,
});

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

function uploadVideoToCloudinaryForFal(buffer, filename) {
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

async function waitForFalResult(modelId, requestId) {
  const maxAttempts = 90;
  const delayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Consultando estado fal.ai intento ${attempt}/${maxAttempts}`);

    const status = await fal.queue.status(modelId, {
      requestId,
      logs: true,
    });

    console.log('Estado fal.ai:', status?.status);

    if (status?.status === 'COMPLETED') {
      const result = await fal.queue.result(modelId, {
        requestId,
      });

      return result;
    }

    if (status?.status === 'FAILED') {
      throw new Error('fal.ai devolvió estado FAILED');
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Timeout esperando resultado de fal.ai');
}

function findVideoUrlFromFalResult(result) {
  return (
    result?.data?.video?.url ||
    result?.data?.video_url ||
    result?.data?.url ||
    result?.data?.output?.url ||
    result?.data?.output?.[0]?.url ||
    result?.data?.output?.[0] ||
    result?.video?.url ||
    result?.video_url ||
    result?.url ||
    null
  );
}

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ReelSwapAI backend funcionando v7 con fal.ai PixVerse video',
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
      console.log('Nueva petición FaceSwap VIDEO fal.ai PixVerse');

      const faceFile = req.files?.face?.[0];
      const targetFile = req.files?.target?.[0];

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

      targetUpload = await uploadVideoToCloudinaryForFal(
        targetFile.buffer,
        `target-video-${Date.now()}`
      );

      const falVideoUrl = targetUpload.secure_url;

      console.log('Face subida:', faceUpload.secure_url);
      console.log('Video subido:', targetUpload.secure_url);
      console.log('Video fal URL:', falVideoUrl);

      const modelId = 'fal-ai/pixverse/swap';

      console.log('Enviando petición a fal.ai:', modelId);

      const submitResult = await fal.queue.submit(modelId, {
        input: {
          video_url: falVideoUrl,
          image_url: faceUpload.secure_url,
          swap_mode: 'person',
          keyframe_id: 1,
          original_sound_switch: true,
        },
      });

      console.log('fal.ai requestId:', submitResult.request_id);

      const falResult = await waitForFalResult(
        modelId,
        submitResult.request_id
      );

      console.log('Resultado completo fal.ai:');
      console.dir(falResult, { depth: null });

      const resultUrl = findVideoUrlFromFalResult(falResult);

      console.log('URL resultado detectada fal.ai:', resultUrl);

      if (!resultUrl) {
        await deleteFromCloudinary(faceUpload.public_id, 'image');
        await deleteFromCloudinary(targetUpload.public_id, 'video');

        return res.status(500).json({
          success: false,
          error: 'No se encontró URL de vídeo en respuesta de fal.ai',
          data: falResult,
        });
      }

      const resultResponse = await fetch(resultUrl);

      if (!resultResponse.ok) {
        const resultErrorText = await resultResponse.text();

        await deleteFromCloudinary(faceUpload.public_id, 'image');
        await deleteFromCloudinary(targetUpload.public_id, 'video');

        return res.status(500).json({
          success: false,
          error: 'No se pudo descargar el vídeo generado por fal.ai',
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
      console.log('Nueva petición FaceSwap FOTO');

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor funcionando en puerto ${PORT}`);
});