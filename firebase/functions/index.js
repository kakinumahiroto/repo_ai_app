/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const admin = require("firebase-admin");
require("dotenv").config();

// OpenAI API endpoint
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

if (!admin.apps.length) {
  admin.initializeApp();
}

exports.aiAnswer = onRequest({
  region: "us-central1",
}, async (req, res) => {
  logger.info("AI Answer endpoint called");
  const {question, grade, uid} = req.body;
  if (!question) {
    return res.status(400).json({error: "question is required"});
  }
  // 学年に応じてプロンプトを調整
  let systemPrompt = "あなたは親切な家庭教師です。答えを直接教えず、ヒントや考え方を段階的に説明してください。";
  if (grade === "小学生") {
    systemPrompt += " 小学生にも分かるように、やさしい言葉で説明してください。";
  } else if (grade === "中学生") {
    systemPrompt += " 中学生向けに、丁寧に説明してください。";
  } else if (grade === "高校生") {
    systemPrompt += " 高校生向けに、論理的に説明してください。";
  }
  // 「答えだけ教えて」などの出力制御: ユーザー質問に応じてsystemPromptを強化
  if (/答えだけ|答えを教えて|正解だけ|解答だけ/i.test(question)) {
    systemPrompt += " ただし、答えや正解を直接伝えず、必ずヒントや考え方のみを段階的に説明してください。";
  }
  // 曖昧な質問の具体化誘導: 「わからない」「教えて」など曖昧な場合は追加プロンプト
  if (/わからない|分からない|教えて|できない|どうすれば|どうやって|ヒント/i.test(question)) {
    systemPrompt += " 質問が曖昧な場合は、どの教科・単元か、どこが分からないかを生徒に優しく聞き返してください。";
  }
  try {
    const response = await axios.post(
        OPENAI_API_URL,
        {
          model: OPENAI_MODEL,
          messages: [
            {role: "system", content: systemPrompt},
            {role: "user", content: question},
          ],
          max_tokens: 2048,
          temperature: 0.7,
          top_p: 1,
          stream: false,
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        },
    );
    const aiMessage = response.data.choices[0].message.content;
    // Firestoreに履歴保存
    await admin.firestore().collection("questionHistory").add({
      question,
      answer: aiMessage,
      grade: grade || "",
      uid: uid || "",
      createdAt: new Date().toISOString(),
    });
    res.json({answer: aiMessage});
  } catch (err) {
    logger.error("OpenAI API error", err);
    if (err.response && err.response.status === 429) {
      // 429 Too Many Requests: 利用制限超過や無料枠上限
      return res.status(429).json({
        error: "現在AIサーバーが混雑中、または利用上限に達しています。しばらくしてから再度お試しください。",
      });
    }
    res.status(500).json({error: "AI回答取得に失敗しました"});
  }
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
