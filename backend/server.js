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
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ReelSwapAI backend funcionando',
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

      const faceFile = req.files['face'][0];
      const targetFile = req.files['target'][0];

      const form = new FormData();

      form.append('source_image', faceFile.buffer, {
        filename: faceFile.originalname,
        contentType: faceFile.mimetype,
      });

      form.append('target_video', targetFile.buffer, {
        filename: targetFile.originalname,
        contentType: targetFile.mimetype,
      });

      form.append('target_face_index', '0');
      form.append('face_restore', 'true');

      const response = await axios.post(
        'https://api.segmind.com/v1/video-face-swap',
        form,
        {
          headers: {
            ...form.getHeaders(),
            'x-api-key': process.env.SEGMIND_API_KEY,
          },
          responseType: 'arraybuffer',
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
      console.log(error.response?.data || error.message);

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor funcionando en puerto ${PORT}`);
});