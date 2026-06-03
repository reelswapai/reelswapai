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
      console.log('Nueva petición FaceSwap FOTO PiAPI');

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

      targetUpload = await uploadImageToCloudinaryForPiapi(
        targetFile.buffer,
        'reelswapai/targets',
        `target-image-${Date.now()}`
      );

      console.log('Face subida:', faceUpload.secure_url);
      console.log('Imagen target subida:', targetUpload.secure_url);

      const taskId = await createPiapiTask({
        model: 'Qubico/image-toolkit',
        task_type: 'face-swap',
        input: {
          swap_image: faceUpload.secure_url,
          target_image: targetUpload.secure_url,
        },
      });

      console.log('PiAPI taskId foto:', taskId);

      const piapiResult = await waitForPiapiTask(taskId);

      console.log('Resultado completo PiAPI foto:');
      console.dir(piapiResult, { depth: null });

      const resultUrl = findOutputUrlFromPiapiResult(piapiResult);

      console.log('URL resultado PiAPI foto:', resultUrl);

      if (!resultUrl) {
        await deleteFromCloudinary(faceUpload.public_id, 'image');
        await deleteFromCloudinary(targetUpload.public_id, 'image');

        return res.status(500).json({
          success: false,
          error: 'No se encontró URL de imagen en respuesta de PiAPI',
          data: piapiResult,
        });
      }

      const resultResponse = await fetch(resultUrl);

      if (!resultResponse.ok) {
        const resultErrorText = await resultResponse.text();

        await deleteFromCloudinary(faceUpload.public_id, 'image');
        await deleteFromCloudinary(targetUpload.public_id, 'image');

        return res.status(500).json({
          success: false,
          error: 'No se pudo descargar la imagen generada por PiAPI',
          details: resultErrorText,
        });
      }

      const resultBuffer = Buffer.from(await resultResponse.arrayBuffer());

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