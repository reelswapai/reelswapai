import { v2 as cloudinary } from 'cloudinary';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';

dotenv.config();

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
    message: 'ReelSwapAI backend funcionando v2 con imageswap',
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
      console.log('Nueva petición FaceSwap VIDEO');

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
        'reelswapai/faces',
        `face-${Date.now()}`
      );

      const targetUpload = await uploadToCloudinary(
        targetFile.buffer,
        'video',
        'reelswapai/targets',
        `target-video-${Date.now()}`
      );

      const response = await fetch(
        'https://api.segmind.com/v1/video-faceswap-by-facefusion-labs',
        {
          method: 'POST',
          headers: {
            'x-api-key': process.env.SEGMIND_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source_image: faceUpload.secure_url,
            target_video: targetUpload.secure_url,
            pixel_boost: '768x768',
            face_selector_mode: 'reference',
            face_selector_order: 'large-small',
            face_selector_age_start: 0,
            face_selector_age_end: 100,
            reference_face_distance: 0.45,
            reference_frame_number: 1,
            base64: false,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Segmind video error:', errorText);

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
    try {
      console.log('Nueva petición FaceSwap FOTO');

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
        'reelswapai/faces',
        `face-${Date.now()}`
      );

      const targetUpload = await uploadToCloudinary(
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
            reference_face_distance: 0.6,
            reference_frame_number: 1,
            base64: false,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Segmind image error:', errorText);

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