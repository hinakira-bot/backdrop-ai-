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
    model: 'gemini-2.0-flash',
    contents: `Extract visual scene elements from the following text to create a professional background image.
Return a concise English description (max 80 words) focusing on: setting, mood, colors, visual atmosphere, key visual elements.
Do NOT include any explanations. Just return the description.

Text: ${text}`,
  });
  return response.text.trim();
}

/**
 * 画像生成（参考画像あり → Gemini、なし → Imagen 3）
 */
export async function generateImage({ prompt, apiKey, aspectRatio = '16:9', referenceImages = [] }) {
  const ai = new GoogleGenAI({ apiKey });

  if (referenceImages.length > 0) {
    // 参考画像あり: Gemini multimodal image generation を使用
    const parts = [];
    for (const imgDataUrl of referenceImages) {
      const base64 = imgDataUrl.split(',')[1];
      const mimeMatch = imgDataUrl.match(/data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      parts.push({ inlineData: { data: base64, mimeType } });
    }
    parts.push({
      text: `Create a professional background image in ${aspectRatio} aspect ratio. Use the reference images above for visual style guidance. ${prompt}`,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: [{ role: 'user', parts }],
      config: { responseModalities: ['IMAGE'] },
    });

    const resParts = response.candidates?.[0]?.content?.parts || [];
    for (const part of resParts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error('Gemini image generation returned no image');
  } else {
    // 参考画像なし: Imagen 3 で高品質生成
    try {
      const response = await ai.models.generateImages({
        model: 'imagen-3.0-generate-005',
        prompt,
        config: {
          numberOfImages: 1,
          aspectRatio,
          outputMimeType: 'image/jpeg',
          safetyFilterLevel: 'BLOCK_ONLY_HIGH',
        },
      });

      const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
      if (imageBytes) {
        return `data:image/jpeg;base64,${imageBytes}`;
      }
      throw new Error('No image returned from Imagen');
    } catch (imagenError) {
      // Imagen が使えない場合は Gemini にフォールバック
      console.warn('Imagen 3 failed, falling back to Gemini:', imagenError.message);

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-preview-image-generation',
        contents: [{ role: 'user', parts: [{ text: `Create a professional background image in ${aspectRatio} aspect ratio. ${prompt}` }] }],
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
  }
}
