import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import FormData from 'form-data';
import fs from 'fs';
import multer from 'multer';

dotenv.config();

const app = express();

app.use(cors());

const upload = multer({ dest: 'uploads/' });

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
      const faceFile = req.files['face'][0];
      const targetFile = req.files['target'][0];

      const formData = new FormData();

      formData.append(
        'source_image',
        fs.createReadStream(faceFile.path)
      );

      formData.append(
        'target_video',
        fs.createReadStream(targetFile.path)
      );

      formData.append('model_name', 'hyperswap_1a');
      formData.append('face_detector_score', '0.3');

      const response = await axios.post(
        'https://api.segmind.com/v1/video-faceswap-by-facefusion-labs',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'x-api-key': process.env.SEGMIND_API_KEY,
          },
          responseType: 'arraybuffer',
        }
      );

      const base64Video = Buffer.from(
        response.data,
        'binary'
      ).toString('base64');

      fs.unlinkSync(faceFile.path);
      fs.unlinkSync(targetFile.path);

      res.json({
        success: true,
        video: base64Video,
      });
    } catch (error) {
      console.log(error?.response?.data || error.message);

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