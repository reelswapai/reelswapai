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
    message: 'ReelSwapAI backend funcionando con Cloudinary + Segmind',
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
      console.log('Nueva petición FaceSwap');

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

      console.log('Enviando a Segmind...');

      const response = await axios.post(
        'https://api.segmind.com/v1/ai-face-swap',
        {
          source_image: faceUpload.secure_url,
          target: targetUpload.secure_url,
          pixel_boost: '384x384',
          face_selector_mode: 'reference',
          face_selector_order: 'large-small',
          face_selector_age_start: 0,
          face_selector_age_end: 100,
          reference_face_distance: 0.6,
          reference_frame_number: 1,
          base64: false,
        },
        {
          headers: {
            'x-api-key': process.env.SEGMIND_API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 300000,
          validateStatus: () => true,
        }
      );

      console.log('Segmind status:', response.status);
      console.log('Segmind response:', response.data);

      if (response.status < 200 || response.status >= 300) {
        return res.status(response.status).json({
          success: false,
          error: response.data,
        });
      }

      const resultUrl =
        response.data?.video ||
        response.data?.output ||
        response.data?.url ||
        response.data?.image ||
        response.data?.result;

      if (!resultUrl) {
        return res.status(500).json({
          success: false,
          error: 'Segmind no devolvió URL de resultado',
          raw: response.data,
        });
      }

      console.log('Descargando resultado:', resultUrl);

      const videoResponse = await axios.get(resultUrl, {
        responseType: 'arraybuffer',
        timeout: 300000,
      });

      res.set({
        'Content-Type': 'video/mp4',
      });

      return res.send(videoResponse.data);
    } catch (error) {
      console.log('ERROR BACKEND:', error.message);

      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor funcionando en puerto ${PORT}`);
});