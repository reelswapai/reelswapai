import { fal } from '@fal-ai/client';
import { v2 as cloudinary } from 'cloudinary';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';

dotenv.config();

const app = express();
const upload = multer();

app.use(cors());

fal.config({
  credentials: process.env.FAL_KEY,
});

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

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ReelSwapAI backend funcionando con fal.ai',
  });
});

app.post(
  '/faceswap',
  upload.fields([
    { name: 'face', maxCount: 1 },
    { name: 'target', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log('Nueva petición FaceSwap FAL');

      const faceFile = req.files?.face?.[0];
      const targetFile = req.files?.target?.[0];

      if (!faceFile || !targetFile) {
        return res.status(400).json({
          success: false,
          error: 'Faltan archivos face o target',
        });
      }

      console.log('Subiendo rostro a Cloudinary...');
      const faceUpload = await uploadToCloudinary(
        faceFile.buffer,
        'image',
        'reelswapai/faces',
        `face-${Date.now()}`
      );

      console.log('Subiendo vídeo a Cloudinary...');
      const targetUpload = await uploadToCloudinary(
        targetFile.buffer,
        'video',
        'reelswapai/targets',
        `target-${Date.now()}`
      );

      console.log('Face URL:', faceUpload.secure_url);
      console.log('Target URL:', targetUpload.secure_url);

      console.log('Enviando a fal.ai...');

      const result = await fal.subscribe('fal-ai/pixverse/swap', {
        input: {
  video_url: targetUpload.secure_url,
  image_url: faceUpload.secure_url,
  
},
        logs: true,
        onQueueUpdate: (update) => {
          console.log('FAL update:', update.status);
        },
      });

      console.log('FAL result:', result.data);

      const resultUrl =
        result.data?.video?.url ||
        result.data?.video_url ||
        result.data?.url ||
        result.data?.output?.url;

      if (!resultUrl) {
        return res.status(500).json({
          success: false,
          error: 'fal.ai no devolvió URL de resultado',
          raw: result.data,
        });
      }

      return res.json({
        success: true,
        videoUrl: resultUrl,
      });
    } catch (error) {
      console.log('ERROR BACKEND:', error);

      return res.status(500).json({
        success: false,
        error: error.message || error,
      });
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor funcionando en puerto ${PORT}`);
});