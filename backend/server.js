import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import FormData from 'form-data';
import multer from 'multer';

dotenv.config();

const app = express();
const upload = multer();

app.use(cors());

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ReelSwapAI backend funcionando con Segmind directo',
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
      const faceFile = req.files?.face?.[0];
      const targetFile = req.files?.target?.[0];

      if (!faceFile || !targetFile) {
        return res.status(400).json({
          success: false,
          error: 'Faltan archivos face o target',
        });
      }

      const form = new FormData();

      form.append('source_image', faceFile.buffer.toString('base64'));

form.append('target_video', targetFile.buffer.toString('base64'));

      form.append('model_name', 'hyperswap_1a');
      form.append('face_detector_score', '0.3');
      form.append('target_face_index', '0');

      const response = await axios.post(
        'https://api.segmind.com/v1/video-faceswap-by-facefusion-labs',
        form,
        {
          headers: {
            ...form.getHeaders(),
            'x-api-key': process.env.SEGMIND_API_KEY,
          },
          responseType: 'arraybuffer',
          timeout: 300000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );

      res.set({ 'Content-Type': 'video/mp4' });
      res.send(response.data);
    } catch (error) {
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