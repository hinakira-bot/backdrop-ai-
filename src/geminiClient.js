import { GoogleGenAI } from '@google/genai';

/**
 * YouTube動画IDをURLから抽出する
 */
export function extractYouTubeVideoId(url) {
  const patterns = [
    /[?&]v=([^&#]+)/,        // youtube.com/watch?v=ID
    /youtu\.be\/([^?&#]+)/,  // youtu.be/ID
    /shorts\/([^?&#]+)/,     // youtube.com/shorts/ID
    /embed\/([^?&#]+)/,      // youtube.com/embed/ID
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * YouTubeサムネイルを取得してBase64とDataURLで返す
 * maxresdefault → hqdefault の順でフォールバック
 */
export async function fetchYouTubeThumbnail(videoId) {
  const sizes = ['maxresdefault', 'hqdefault', 'sddefault'];
  for (const size of sizes) {
    const thumbUrl = `https://img.youtube.com/vi/${videoId}/${size}.jpg`;
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(thumbUrl)}&type=image`);
      if (res.ok) {
        const data = await res.json();
        if (data.base64) {
          return {
            base64: data.base64,
            mimeType: data.mimeType || 'image/jpeg',
            dataUrl: `data:${data.mimeType || 'image/jpeg'};base64,${data.base64}`,
          };
        }
      }
    } catch {
      continue;
    }
  }
  throw new Error('YouTubeサムネイルの取得に失敗しました');
}

/**
 * YouTubeサムネイルをGeminiで分析して背景シーンの説明を返す
 */
export async function analyzeYoutubeThumbnail(videoId, apiKey) {
  const thumbnail = await fetchYouTubeThumbnail(videoId);

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { data: thumbnail.base64, mimeType: thumbnail.mimeType } },
        {
          text: `Analyze the background and visual scene of this YouTube thumbnail.
Describe in English (max 100 words) the elements that could be used to recreate a similar professional background image:
- Scene/location/setting
- Lighting and atmosphere
- Color palette and mood
- Key visual background elements (NOT the people or text in the foreground)
Focus ONLY on background elements, not on people, faces, or text overlays.`,
        },
      ],
    }],
  });

  return {
    description: response.text.trim(),
    thumbnail,
  };
}

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
