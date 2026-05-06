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

app.post('/faceswap', async (req, res) => {
  res.json({
    success: true,
    message: 'Railway recibe /faceswap correctamente',
  });
});

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