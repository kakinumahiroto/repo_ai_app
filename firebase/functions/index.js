/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");
require("dotenv").config();

// OpenAI API endpoint
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

exports.aiAnswer = onRequest({
  region: "us-central1"
}, async (req, res) => {
  logger.info("AI Answer endpoint called");
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: "question is required" });
  }
  try {
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: "あなたは親切な家庭教師です。答えを直接教えず、ヒントや考え方を段階的に説明してください。" },
          { role: "user", content: question }
        ],
        max_tokens: 512
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    const aiMessage = response.data.choices[0].message.content;
    res.json({ answer: aiMessage });
  } catch (err) {
    logger.error("OpenAI API error", err);
    res.status(500).json({ error: "AI回答取得に失敗しました" });
  }
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
