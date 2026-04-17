import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Gemini API Proxy (Multimodal & Cheaper)
  app.post("/api/gemini", async (req, res) => {
    try {
      const { prompt, imageBase64, mimeType } = req.body;
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const parts: any[] = [{ text: prompt }];
      if (imageBase64 && mimeType) {
        parts.push({
          inlineData: {
            data: imageBase64,
            mimeType: mimeType
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts }]
      });

      res.json({
        content: response.text,
        usage: response.usageMetadata
      });
    } catch (error) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // DeepSeek API Proxy
  app.post("/api/deepseek", async (req, res) => {
    try {
      const { messages, responseFormat } = req.body;
      
      // Use provided key as fallback if env var is not set
      const apiKey = process.env.DEEPSEEK_API_KEY || "sk-9fafa77cc6f84cdf80c92ca2c17fe2c4";
      
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: messages,
          response_format: responseFormat || { type: "text" }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("DeepSeek API Error:", errorText);
        return res.status(response.status).json({ error: errorText });
      }

      const data = await response.json();
      res.json({
        content: data.choices[0].message.content,
        usage: data.usage
      });
    } catch (error) {
      console.error("Server Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
