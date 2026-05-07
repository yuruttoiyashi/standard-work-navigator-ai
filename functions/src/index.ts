import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

type ProcedurePayload = {
  title?: string;
  category?: string;
  targetRole?: string;
  difficulty?: string;
  estimatedMinutes?: number;
  purpose?: string;
  tools?: string;
  stepsText?: string;
  attention?: string;
  commonMistakes?: string;
  checklistText?: string;
};

function limitText(value: unknown, max = 2500): string {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

function cleanJsonText(text: string): string {
  return text
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
}

export const generateWorkGuide = onCall(
  {
    region: "asia-northeast1",
    timeoutSeconds: 60,
    secrets: [GEMINI_API_KEY],
    cors: true,
  },
  async (request) => {
    const procedure = request.data?.procedure as ProcedurePayload | undefined;

    if (!procedure) {
      throw new HttpsError("invalid-argument", "procedure data is required.");
    }

    const title = limitText(procedure.title, 120);
    const category = limitText(procedure.category, 80);
    const targetRole = limitText(procedure.targetRole, 80);
    const difficulty = limitText(procedure.difficulty, 30);
    const purpose = limitText(procedure.purpose, 800);
    const tools = limitText(procedure.tools, 800);
    const stepsText = limitText(procedure.stepsText, 2500);
    const attention = limitText(procedure.attention, 1200);
    const commonMistakes = limitText(procedure.commonMistakes, 1200);
    const checklistText = limitText(procedure.checklistText, 1200);
    const estimatedMinutes = Number(procedure.estimatedMinutes || 0);

    if (!title || !purpose || !stepsText) {
      throw new HttpsError(
        "invalid-argument",
        "作業名・作業目的・手順は必須です。"
      );
    }

    const prompt = `
あなたは物流現場・事務作業・新人教育に強い業務改善コンサルタントです。
以下の作業手順を、職場提出用の標準作業ナビゲーションとして整理してください。

必ずJSONのみで返してください。Markdownや説明文は不要です。

JSON形式:
{
  "summary": "新人にも伝わる作業概要",
  "trainingPoints": ["教育時に重点的に伝えるポイント"],
  "riskPoints": ["作業ミス・事故・遅延につながるリスク"],
  "standardChecklist": ["作業前・作業中・作業後の確認項目"],
  "handoverMemo": "引き継ぎ時に伝えるべき内容",
  "managerComment": "管理者向けの改善コメント"
}

作業名: ${title}
カテゴリ: ${category}
対象者: ${targetRole}
難易度: ${difficulty}
想定時間: ${estimatedMinutes}分

作業目的:
${purpose}

必要なもの:
${tools}

作業手順:
${stepsText}

注意点:
${attention}

よくあるミス:
${commonMistakes}

既存チェック項目:
${checklistText}
`;

    try {
      const apiKey = GEMINI_API_KEY.value();

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text:
                    "あなたは日本語で、現場向けに簡潔かつ実務的な業務手順・教育資料を作成する専門家です。",
                },
              ],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.35,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Gemini API error", errorText);
        throw new HttpsError("internal", "Gemini APIの呼び出しに失敗しました。");
      }

      const json = await response.json();
      const text =
        json.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text || "")
          .join("") || "";

      const cleaned = cleanJsonText(text);

      try {
        return JSON.parse(cleaned);
      } catch {
        logger.warn("JSON parse failed. Raw text:", text);
        return {
          summary: cleaned,
          trainingPoints: [],
          riskPoints: [],
          standardChecklist: [],
          handoverMemo: "",
          managerComment:
            "AI応答のJSON整形に失敗しました。内容を確認して再生成してください。",
        };
      }
    } catch (error) {
      logger.error(error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "AI生成中にエラーが発生しました。");
    }
  }
);