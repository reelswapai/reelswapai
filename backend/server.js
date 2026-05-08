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

      const response = await fetch('https://api.segmind.com/v1/video-faceswap-by-facefusion-labs', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.SEGMIND_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    source_image: faceUpload.secure_url,
    target_video: targetUpload.secure_url,
    pixel_boost: '384x384',
    face_selector_mode: 'reference',
    face_selector_order: 'large-small',
    face_selector_age_start: 0,
    face_selector_age_end: 100,
    reference_face_distance: 0.6,
    reference_frame_number: 1,
    base64: false,
  }),
});

if (!response.ok) {
  const errorText = await response.text();
  console.log('Segmind error:', errorText);

  return res.status(500).json({
    success: false,
    error: errorText,
  });
}

const resultBuffer = Buffer.from(await response.arrayBuffer());

const finalUpload = await uploadToCloudinary(
  resultBuffer,
  'video',
  'reelswapai/results',
  `result-${Date.now()}`
);

return res.json({
  success: true,
  videoUrl: finalUpload.secure_url,
});

      return res.json({
        success: true,
        videoUrl: resultUrl,
      });
    } catch (error) {
      console.log('ERROR BACKEND FULL:');
console.dir(error, { depth: null });

return res.status(500).json({
  success: false,
  error: error?.body || error?.message || error,
});
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor funcionando en puerto ${PORT}`);
});