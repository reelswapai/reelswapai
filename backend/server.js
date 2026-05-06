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

app.post("/faceswap", async (req, res) => {
  try {
    console.log("Nueva petición FaceSwap");

    res.json({
      success: true,
      message: "Backend conectado correctamente 🚀",
      result_url:
        "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor funcionando en puerto ${PORT}`);
});