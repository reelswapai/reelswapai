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
      console.log('Nueva petición FaceSwap');

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

      console.log('Enviando a Segmind...');

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
          validateStatus: () => true,
        }
      );

      const contentType = response.headers?.['content-type'] || '';

      console.log('Segmind status:', response.status);
      console.log('Segmind content-type:', contentType);

      const looksLikeMp4 =
  response.data?.[4] === 0x66 &&
  response.data?.[5] === 0x74 &&
  response.data?.[6] === 0x79 &&
  response.data?.[7] === 0x70;

if (response.status >= 200 && response.status < 300 && looksLikeMp4) {
        console.log('Segmind devolvió vídeo OK');

        res.set({
          'Content-Type': 'video/mp4',
        });

        return res.send(response.data);
      }

      const text = Buffer.from(response.data).toString('utf8');

      console.log('Segmind no devolvió vídeo:');
      console.log(text);

      return res.status(response.status || 500).json({
        success: false,
        error: text,
      });
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