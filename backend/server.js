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

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ReelSwapAI backend funcionando con fal.ai',
  });
});

function uploadToCloudinary(buffer, resourceType, folder) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          resource_type: resourceType,
          folder,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      )
      .end(buffer);
  });
}

app.post(
  '/faceswap',
  upload.fields([
    { name: 'face', maxCount: 1 },
    { name: 'target', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log('Nueva petición FaceSwap con fal.ai');

      const faceFile = req.files?.face?.[0];
      const targetFile = req.files?.target?.[0];

      if (!faceFile || !targetFile) {
        return res.status(400).json({
          success: false,
          error: 'Faltan archivos face o target',
        });
      }

      const faceUpload = await uploadToCloudinary(
        faceFile.buffer,
        'image',
        'reelswap/faces'
      );

      const videoUpload = await uploadToCloudinary(
        targetFile.buffer,
        'video',
        'reelswap/videos'
      );

      console.log('Cloudinary OK');
      console.log('Face:', faceUpload.secure_url);
      console.log('Video:', videoUpload.secure_url);

      const result = await fal.subscribe('fal-ai/pixverse/swap', {
        input: {
          video_url: videoUpload.secure_url,
          image_url: faceUpload.secure_url,
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            update.logs?.forEach((log) => console.log(log.message));
          }
        },
      });

      console.log('fal.ai respondió OK');
      console.log(result.data);

      res.json({
        success: true,
        result: result.data,
      });
    } catch (error) {
      console.log('ERROR FAL:');
      console.log(error);

      res.status(500).json({
        success: false,
        error: error.message || 'Error generando con fal.ai',
      });
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor funcionando en puerto ${PORT}`);
});