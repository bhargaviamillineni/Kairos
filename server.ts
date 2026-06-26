import express from "express";
import path from "path";
import cors from "cors";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { 
  parseVoiceTranscript, 
  analyzeTaskIntake, 
  generateBattlePlan, 
  generateReminderMessage, 
  generateProductivitySummary 
} from "./src/services/geminiService";

// Load local environment variables in development
import dotenv from "dotenv";
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Enable CORS so the decoupled Vercel frontend can communicate with the Render backend
  app.use(cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }));

  // JSON Body Parser for API Requests
  app.use(express.json());

  // --- API ROUTE ENDPOINTS ---

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Voice Note extraction proxy
  app.post("/api/gemini/parse-voice", async (req, res) => {
    try {
      const { transcript, currentTime } = req.body;
      if (!transcript) {
        return res.status(400).json({ error: "Missing 'transcript' parameter." });
      }
      const data = await parseVoiceTranscript(transcript, currentTime || new Date().toISOString());
      res.json(data);
    } catch (error: any) {
      console.error("Error parsing voice transcript server-side:", error);
      res.status(500).json({ error: error.message || "Failed to process voice transcript." });
    }
  });

  // Task Intake analysis proxy
  app.post("/api/gemini/analyze-task", async (req, res) => {
    try {
      const { newTask, existingTasks, currentTime } = req.body;
      if (!newTask) {
        return res.status(400).json({ error: "Missing 'newTask' parameter." });
      }
      const data = await analyzeTaskIntake(newTask, existingTasks || [], currentTime || new Date().toISOString());
      res.json(data);
    } catch (error: any) {
      console.error("Error analyzing task server-side:", error);
      res.status(500).json({ error: error.message || "Failed to analyze task." });
    }
  });

  // Daily Battle Plan generator proxy
  app.post("/api/gemini/battle-plan", async (req, res) => {
    try {
      const { tasks, freeSlots, currentTime } = req.body;
      const data = await generateBattlePlan(tasks || [], freeSlots || [], currentTime || new Date().toISOString());
      res.json(data);
    } catch (error: any) {
      console.error("Error generating daily battle plan server-side:", error);
      res.status(500).json({ error: error.message || "Failed to generate schedule battle plan." });
    }
  });

  // Proactive reminder message generator proxy
  app.post("/api/gemini/reminder", async (req, res) => {
    try {
      const { taskName, timeRemaining, completionPercent } = req.body;
      if (!taskName) {
        return res.status(400).json({ error: "Missing 'taskName' parameter." });
      }
      const data = await generateReminderMessage(taskName, timeRemaining || "a few hours", completionPercent ?? 0);
      res.json(data);
    } catch (error: any) {
      console.error("Error generating reminder server-side:", error);
      res.status(500).json({ error: error.message || "Failed to generate reminder." });
    }
  });

  // End of Day productivity summary proxy
  app.post("/api/gemini/summary", async (req, res) => {
    try {
      const { completedTasks } = req.body;
      const data = await generateProductivitySummary(completedTasks || []);
      res.json(data);
    } catch (error: any) {
      console.error("Error generating productivity summary server-side:", error);
      res.status(500).json({ error: error.message || "Failed to generate productivity summary." });
    }
  });


  // --- VITE MIDDLEWARE SETUP ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(indexPath);
      });
    } else {
      // Decoupled Mode: Serves a clean health status when run as an API-only service (e.g. on Render)
      app.get("/", (req, res) => {
        res.json({
          status: "online",
          message: "Kairos AI Backend Service is running successfully in decoupled API mode.",
          timestamp: new Date().toISOString()
        });
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Kairos] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
