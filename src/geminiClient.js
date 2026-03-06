import { GoogleGenAI } from '@google/genai';

/**
 * URLのコンテンツをプロキシ経由で取得する
 */
export async function fetchUrlContent(url) {
  try {
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const data = await res.json();
      return data.content || null;
    }
  } catch (e) {
    console.warn('Proxy fetch failed:', e);
  }
  return null;
}

/**
 * テキスト/URLコンテンツから背景画像用のビジュアルキーワードを抽出する
 */
export async function analyzeContent(text, apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Extract visual scene elements from the following text to create a professional background image.
Return a concise English description (max 80 words) focusing on: setting, mood, colors, visual atmosphere, key visual elements.
Do NOT include any explanations. Just return the description.

Text: ${text}`,
  });
  return response.text.trim();
}

const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

/**
 * 画像生成（gemini-3.1-flash-image-preview を使用）
 * 参考画像がある場合はマルチモーダルで渡す
 */
export async function generateImage({ prompt, apiKey, aspectRatio = '16:9', referenceImages = [] }) {
  const ai = new GoogleGenAI({ apiKey });

  const parts = [];

  // 参考画像をパーツに追加
  for (const imgDataUrl of referenceImages) {
    const base64 = imgDataUrl.split(',')[1];
    const mimeMatch = imgDataUrl.match(/data:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    parts.push({ inlineData: { data: base64, mimeType } });
  }

  parts.push({
    text: `Create a professional background image in ${aspectRatio} aspect ratio.${referenceImages.length > 0 ? ' Use the reference images above for visual style guidance.' : ''} ${prompt}`,
  });

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: 'user', parts }],
    config: { responseModalities: ['IMAGE'] },
  });

  const resParts = response.candidates?.[0]?.content?.parts || [];
  for (const part of resParts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error('画像生成に失敗しました。APIキーとモデルの権限を確認してください。');
}
