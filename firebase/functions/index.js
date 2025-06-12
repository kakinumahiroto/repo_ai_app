/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const logger = require("firebase-functions/logger");
const axios = require("axios");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
require("dotenv").config();

// OpenAI API endpoint
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-3.5";

if (!admin.apps.length) {
  admin.initializeApp();
}

// --- CORSヘッダー付与ユーティリティ ---
function setCORSHeaders(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS,PUT,DELETE,PATCH");
}

exports.aiAnswer = functions.https.onRequest(async (req, res) => {
  setCORSHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  logger.info("AI Answer endpoint called");
  const {question, grade, uid} = req.body;
  if (!question) {
    setCORSHeaders(res);
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
    // Firestoreに履歴保存（普通のJSON形式で保存）
    await admin.firestore().collection("questionThreads").add({
      question,
      answer: aiMessage,
      grade: grade || "",
      uid: uid || "",
      createdAt: new Date().toISOString(),
      thread: [],
    });
    res.json({answer: aiMessage});
  } catch (err) {
    logger.error("OpenAI API error", err);
    setCORSHeaders(res);
    if (err.response && err.response.status === 429) {
      return res.status(429).json({
        error: "現在AIサーバーが混雑中、または利用上限に達しています。しばらくしてから再度お試しください。",
      });
    }
    res.status(500).json({error: "AI回答取得に失敗しました"});
  }
});

// --- RAG付きAI回答エンドポイント ---
const { ChatOpenAI } = require("@langchain/openai");
const { PromptTemplate } = require("langchain/prompts");
const { RunnableSequence } = require("langchain/schema/runnable");

// --- v1: region指定なしでCORS完全対応 ---
exports.ragChat = functions.https.onRequest(async (req, res) => {
  setCORSHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  const { uid, question, currentThread, imageData } = req.body;
  if (!uid || !question) {
    setCORSHeaders(res);
    return res.status(400).json({ error: "uid and question are required" });
  }
  try {
    // 1. Firestoreから最新10件の履歴取得
    const snap = await admin.firestore()
      .collection("questionThreads")
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    let history = [];
    snap.forEach(doc => {
      const d = doc.data();
      if (d.question && d.answer) {
        history.push({ role: "user", content: d.question });
        history.push({ role: "assistant", content: d.answer });
      }
      if (Array.isArray(d.thread)) {
        d.thread.forEach(t => {
          if (t.q && t.a) {
            history.push({ role: "user", content: t.q });
            history.push({ role: "assistant", content: t.a });
          }
        });
      }
    });
    history = history.reverse();
    if (currentThread && currentThread.question) {
      history.push({ role: "user", content: currentThread.question });
      if (currentThread.answer) {
        history.push({ role: "assistant", content: currentThread.answer });
      }
      if (Array.isArray(currentThread.thread)) {
        currentThread.thread.forEach(t => {
          if (t.question) history.push({ role: "user", content: t.question });
          if (t.answer) history.push({ role: "assistant", content: t.answer });
        });
      }
    }
    const trimmedHistory = history.slice(-16);
    const lastUser = trimmedHistory.filter(h => h.role === "user").map(h => h.content).slice(-2).join(" / ");
    const lastAssistant = trimmedHistory.filter(h => h.role === "assistant").map(h => h.content).slice(-2).join(" / ");
    const contextSummary = `直前の会話: ユーザー「${lastUser}」 / AI「${lastAssistant}」`;
    const userMessage = `${contextSummary}\n質問: ${question}`;
    // 2. LangChainでRAG要点抽出（RunnableSequence新API）
    const llm = new ChatOpenAI({
      openAIApiKey: OPENAI_API_KEY,
      modelName: "gpt-3.5-turbo",
      temperature: 0.2,
      maxTokens: 512,
    });
    const prompt = PromptTemplate.fromTemplate(
      "以下は生徒とAIの会話履歴です。重要な発言・話題・意図を要約してください。\n---\n{history}\n---\n要点:"
    );
    const ragChain = RunnableSequence.from([
      async (input) => ({ history: input }),
      prompt,
      llm,
      async (output) => output.content // ChatOpenAIの返却値からcontentのみ抽出
    ]);
    const historyText = trimmedHistory.map(h => `${h.role}: ${h.content}`).join("\n");
    const summary = await ragChain.invoke(historyText);
    // --- 画像データがある場合はOpenAI Vision APIで画像＋テキストプロンプト ---
    let aiMessage;
    if (imageData) {
      // gpt-4o, gpt-4-vision-previewはimagesプロパティで画像を受け付ける
      const visionMessages = [
        { role: "system", content: `会話履歴の要点: ${summary}` },
        ...trimmedHistory,
        {
          role: "user",
          content: [
            { type: "text", text: userMessage },
            { type: "image_url", image_url: { url: imageData } }
          ]
        }
      ];
      visionMessages.push({ role: "system", content: `[DEBUG] RAG要約: ${summary}` });
      const response = await axios.post(
        OPENAI_API_URL,
        {
          model: OPENAI_MODEL,
          messages: visionMessages,
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
      aiMessage = response.data.choices[0].message.content;
    } else {
      // ...従来通り...
      const messages = [
        { role: "system", content: `会話履歴の要点: ${summary}` },
        ...trimmedHistory,
        { role: "user", content: userMessage }
      ];
      messages.push({ role: "system", content: `[DEBUG] RAG要約: ${summary}` });
      const response = await axios.post(
        OPENAI_API_URL,
        {
          model: OPENAI_MODEL,
          messages,
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
      aiMessage = response.data.choices[0].message.content;
    }
    res.json({ answer: aiMessage, rag_summary: summary, debug_rag_summary: summary });
  } catch (err) {
    logger.error("RAG Chat API error", err);
    setCORSHeaders(res);
    res.status(500).json({ error: "RAG付きAI回答取得に失敗しました" });
  }
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
