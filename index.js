const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const WebSocket = require("ws");

const app = express();
app.use(bodyParser.json());
app.use(cors());

const DID_KEY = "";
const ELEVENLABS_API_KEY = "";
const WEBHOOK_URL =
  "https://did-video-server-production.up.railway.app/webhook";

let clients = [];

// Initialize WebSocket server
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");
  clients.push(ws);

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
    clients = clients.filter((client) => client !== ws);
  });
});

const notifyClients = (message) => {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
};

// POST: Create video generation request
app.post("/generate-video", async (req, res) => {
  const { script, avatarUrl, voice_id } = req.body;

  if (!script || !avatarUrl || !voice_id) {
    return res
      .status(400)
      .json({ error: "Script, avatarUrl, and voice_id are required" });
  }
  const postOptions = {
    method: "POST",
    url: "https://api.d-id.com/talks",
    headers: {
      Authorization: `Basic ${DID_KEY}`,
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key-external": `{"elevenlabs": "${ELEVENLABS_API_KEY}"}`,
    },
    data: {
      source_url: avatarUrl,
      script: {
        type: "text",
        subtitles: "false",
        provider: {
          type: "elevenlabs",
          voice_id,
          model_id: "eleven_turbo_v2",
        },
        input: script,
      },
      config: { fluent: "false", pad_audio: "0.0" },
      webhook: WEBHOOK_URL,
    },
  };

  try {
    const response = await axios.request(postOptions);
    console.log("response from did", response.data);
    res.status(200).json({
      message: "Video generation initiated",
      videoId: response.data.id,
    });
  } catch (error) {
    console.error(
      "Error generating video:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to initiate video generation" });
  }
});

// POST: Webhook endpoint to receive results
app.post("/webhook", (req, res) => {
  const { id, status, result_url } = req.body;

  if (status === "done" && result_url) {
    console.log(`Video generation completed. Result URL: ${result_url}`);
    notifyClients({ id, status, result_url });
  } else if (status === "failed") {
    console.error(`Video generation failed for ID: ${id}`);
    notifyClients({ id, status });
  }

  res.status(200).send("Webhook received");
});

// Example GET route to check backend status
app.get("/", (req, res) => {
  res.send("Backend is running!");
});

// Start server
const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
