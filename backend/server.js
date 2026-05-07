import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import FormData from 'form-data';
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
    message: 'ReelSwapAI backend funcionando',
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
      console.log('Nueva petición FaceSwap');

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
      console.log(faceUpload.secure_url);
      console.log(videoUpload.secure_url);

      const form = new FormData();

      form.append('source_image', faceUpload.secure_url);
      form.append('target_video', videoUpload.secure_url);
      form.append('model_name', 'hyperswap_1a');
      form.append('face_detector_score', '0.3');
      form.append('target_face_index', '0');

      const response = await axios.post(
  'https://api.segmind.com/v1/ai-face-swap',
  {
    source_image: faceUpload.secure_url,
    target: videoUpload.secure_url,
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
    responseType: 'json',
    timeout: 300000,
  }
);

      console.log('Segmind respondió OK');

      res.json(response.data);
    } catch (error) {
      console.log('ERROR REAL:');

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

app.listen(PORT, () => {
  console.log(`Servidor funcionando en puerto ${PORT}`);
});