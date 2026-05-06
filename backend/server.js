import cors from "cors";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "ReelSwapAI backend funcionando",
  });
});

app.post("/generate-video", async (req, res) => {
  try {
    const { source_image, target_video } = req.body;

    if (!source_image || !target_video) {
      return res.status(400).json({
        error: "Faltan source_image o target_video",
      });
    }

    const response = await fetch(
      "https://api.segmind.com/v1/video-faceswap-by-facefusion-labs",
      {
        method: "POST",
        headers: {
          "x-api-key": process.env.SEGMIND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_image,
          target_video,
          model_name: "hyperswap_1a",
          face_detector_score: 0.5,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Error Segmind",
        details: data,
      });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "Error interno",
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor ReelSwapAI funcionando en puerto ${PORT}`);
});