import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';

dotenv.config();

const app = express();
const upload = multer();

app.use(cors());

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ReelSwapAI backend funcionando con Segmind HyperSwap',
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
      console.log('Nueva petición HyperSwap');

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

      const response = await axios.post(
        'https://api.segmind.com/v1/video-faceswap-by-facefusion-labs',
        {
          source_image: faceUpload.secure_url,
          target_video: videoUpload.secure_url,
          model_name: 'hyperswap_1a',
          face_detector_score: 0.3,
          target_face_index: 0,
        },
        {
          headers: {
            'x-api-key': process.env.SEGMIND_API_KEY,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 300000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );

      console.log('Segmind respondió OK');

      res.set({
        'Content-Type': 'video/mp4',
      });

      res.send(response.data);
    } catch (error) {
      console.log('ERROR SEGMIND:');

      if (error.response) {
        console.log(error.response.status);
        console.log(Buffer.from(error.response.data).toString('utf8'));
      } else {
        console.log(error.message);
      }

      res.status(500).json({
        success: false,
        error: error.response
          ? Buffer.from(error.response.data).toString('utf8')
          : error.message,
      });
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor funcionando en puerto ${PORT}`);
});