import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Download, ImageIcon, Link, Type, Sparkles,
  History, ChevronDown, ChevronUp, X, Plus, Minus,
  MapPin, Package, User, AlertCircle,
  Loader2, Key, Eye, EyeOff, Trash2, RefreshCw,
} from 'lucide-react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import {
  analyzeContent, fetchUrlContent, generateImage,
  extractYouTubeVideoId, fetchYouTubeThumbnail, analyzeYoutubeThumbnail,
} from './geminiClient';

// ===== 定数 =====

const THEMES = [
  { id: 'business',  label: 'ビジネス',      en: 'clean professional business, corporate, minimalist white space' },
  { id: 'tech',      label: 'テック',         en: 'technology, digital, futuristic, sleek, high-tech, abstract circuit patterns' },
  { id: 'nature',    label: 'ナチュラル',     en: 'natural, organic, fresh, botanical, lush greenery, serene nature' },
  { id: 'pop',       label: 'ポップ',         en: 'colorful, playful, vibrant, fun, cheerful, energetic bright colors' },
  { id: 'minimal',   label: 'ミニマル',       en: 'minimalist, clean lines, simple shapes, elegant, generous whitespace' },
  { id: 'dark',      label: 'ダーク',         en: 'dark, moody, dramatic, cinematic, deep shadows, noir atmosphere' },
  { id: 'retro',     label: 'レトロ',         en: 'retro, vintage, nostalgic, classic, aged texture, film grain' },
  { id: 'japanese',  label: '和風',           en: 'japanese style, zen, traditional japanese aesthetic, elegant oriental, wabi-sabi' },
  { id: 'luxury',    label: 'ラグジュアリー', en: 'luxury, premium, high-end, sophisticated, gold accents, opulent' },
  { id: 'cyber',     label: 'サイバーパンク', en: 'cyberpunk, neon lights, futuristic dystopian city, sci-fi neon glow, electric atmosphere' },
];

const ATMOSPHERES = [
  { id: 'morning', label: '朝',    en: 'early morning, soft golden sunrise light, calm peaceful atmosphere' },
  { id: 'daytime', label: '昼',    en: 'bright midday, clear natural light, vivid colors' },
  { id: 'sunset',  label: '夕暮れ', en: 'sunset golden hour, warm orange pink light, dramatic colorful sky' },
  { id: 'night',   label: '夜',    en: 'night time, moonlight, stars, dark atmospheric, glowing city lights' },
  { id: 'cloudy',  label: '曇り',  en: 'overcast cloudy sky, soft diffused light, muted tones' },
  { id: 'foggy',   label: '霧・靄', en: 'misty foggy atmosphere, ethereal, mysterious soft light' },
  { id: 'rainy',   label: '雨',    en: 'rainy weather, wet surfaces, reflections on ground, moody rain drops' },
  { id: 'sunny',   label: '晴天',  en: 'bright sunny day, clear blue sky, vibrant energetic light' },
  { id: 'none',    label: 'なし',  en: '' },
];

const ILLUSTRATION_STYLES = [
  { id: 'digital',     label: 'デジタルアート', en: 'digital painting, vibrant digital art illustration' },
  { id: 'watercolor',  label: '水彩',          en: 'watercolor painting, soft edges, artistic brush strokes, delicate washes' },
  { id: 'flat',        label: 'フラット',       en: 'flat design illustration, geometric shapes, clean vector style' },
  { id: 'anime',       label: 'アニメ/マンガ',  en: 'anime illustration, manga art style, Japanese animation aesthetic' },
  { id: 'sketch',      label: 'スケッチ',       en: 'detailed pencil sketch, hand-drawn illustration, fine line art' },
];

const ASPECT_RATIOS = [
  { id: '16:9', label: '16:9', desc: 'スタンダード' },
  { id: '4:3',  label: '4:3',  desc: 'クラシック' },
  { id: '1:1',  label: '1:1',  desc: '正方形' },
  { id: '9:16', label: '9:16', desc: '縦長' },
];

const HISTORY_KEY = 'backdropai_history';
const MAX_HISTORY = 10;

// ===== ユーティリティ =====

function buildPrompt({ inputText, imageType, illustrationStyle, theme, atmosphere, mainColor, useColor, location, items, character }) {
  const parts = [];

  // スタイル
  if (imageType === 'photo') {
    parts.push('Photorealistic professional background photograph, high quality DSLR photography');
  } else {
    const style = ILLUSTRATION_STYLES.find(s => s.id === illustrationStyle);
    parts.push(`Professional ${style?.en || 'illustration'} background artwork`);
  }

  // メインコンテンツ
  if (inputText) {
    parts.push(`Visual theme: ${inputText}`);
  }

  // テーマ
  const themeObj = THEMES.find(t => t.id === theme);
  if (themeObj) parts.push(`Aesthetic: ${themeObj.en}`);

  // 雰囲気
  const atmObj = ATMOSPHERES.find(a => a.id === atmosphere);
  if (atmObj?.en) parts.push(`Atmosphere: ${atmObj.en}`);

  // カラー
  if (useColor && mainColor) {
    parts.push(`Primary color palette: ${mainColor}, harmonious complementary colors`);
  }

  // 詳細
  if (location) parts.push(`Scene/Location: ${location}`);
  if (items)    parts.push(`Featured objects/elements: ${items}`);
  if (character) parts.push(`Characters: ${character}`);

  // 品質
  parts.push(
    'Wide landscape orientation, suitable as website or presentation background',
    'Professional quality, high resolution, no text overlay, no watermarks'
  );

  return parts.join('. ');
}

function compressToThumbnail(dataUrl, maxWidth = 400) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = maxWidth / img.width;
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

async function addToHistory(imageDataUrl, settings) {
  try {
    const history = loadHistory();
    const thumbnail = await compressToThumbnail(imageDataUrl);
    const newItem = { id: Date.now(), thumbnail, imageDataUrl, settings, timestamp: new Date().toISOString() };
    const updated = [newItem, ...history].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return loadHistory();
  }
}

// ===== サブコンポーネント =====

function RefImageUpload({ value, onChange }) {
  const inputRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {value ? (
        <div className="relative group rounded-lg overflow-hidden">
          <img src={value} alt="reference" className="w-full h-16 object-cover" />
          <button
            onClick={() => onChange(null)}
            className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-12 border border-dashed border-gray-600 rounded-lg text-gray-500 text-xs hover:border-indigo-500 hover:text-indigo-400 transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus size={12} />
          参考画像
        </button>
      )}
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      {title && (
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function Toggle({ enabled, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${enabled ? 'bg-indigo-600' : 'bg-gray-700'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

// ===== メインコンポーネント =====

export default function BackdropAI() {
  // APIキー
  const [apiKey, setApiKey]   = useState(() => localStorage.getItem('backdropai_key') || '');
  const [showKey, setShowKey] = useState(false);

  // 入力
  const [inputMode, setInputMode] = useState('text'); // 'text' | 'url'
  const [inputText, setInputText] = useState('');
  const [youtubeThumbnail, setYoutubeThumbnail] = useState(null); // { dataUrl, videoId }

  // 画像タイプ
  const [imageType,          setImageType]          = useState('photo');
  const [illustrationStyle,  setIllustrationStyle]  = useState('digital');

  // ビジュアル設定
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [theme,       setTheme]       = useState('business');
  const [atmosphere,  setAtmosphere]  = useState('none');
  const [mainColor,   setMainColor]   = useState('#4F46E5');
  const [useColor,    setUseColor]    = useState(false);

  // 詳細設定
  const [location,     setLocation]     = useState('');
  const [locationRef,  setLocationRef]  = useState(null);
  const [items,        setItems]        = useState('');
  const [itemsRef,     setItemsRef]     = useState(null);
  const [character,    setCharacter]    = useState('');
  const [characterRef, setCharacterRef] = useState(null);

  // ネガティブプロンプト
  const [negToggles, setNegToggles] = useState({
    noText:      true,
    noPeople:    false,
    noLogo:      true,
    noWatermark: true,
  });
  const [negCustom, setNegCustom] = useState('');

  // 生成
  const [variationCount,  setVariationCount]  = useState(2);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [loadingIndex,    setLoadingIndex]    = useState(0);
  const [error,           setError]           = useState('');

  // 履歴
  const [history,     setHistory]     = useState(() => loadHistory());
  const [showHistory, setShowHistory] = useState(false);

  // APIキーをLocalStorageに保存
  useEffect(() => {
    if (apiKey) localStorage.setItem('backdropai_key', apiKey);
  }, [apiKey]);

  // URLモードでYouTube URLを検出したらサムネを自動取得・プレビュー
  useEffect(() => {
    if (inputMode !== 'url') { setYoutubeThumbnail(null); return; }
    const videoId = extractYouTubeVideoId(inputText);
    if (!videoId) { setYoutubeThumbnail(null); return; }
    if (youtubeThumbnail?.videoId === videoId) return; // 同じ動画なら再取得しない

    setYoutubeThumbnail(null);
    fetchYouTubeThumbnail(videoId)
      .then(thumb => setYoutubeThumbnail({ dataUrl: thumb.dataUrl, videoId }))
      .catch(() => {}); // プレビュー失敗は無視（生成時にも再取得）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, inputMode]);

  // ネガティブプロンプト文字列を構築
  const buildNegativePrompt = useCallback(() => {
    const parts = [];
    if (negToggles.noText)      parts.push('no text, no typography, no lettering');
    if (negToggles.noPeople)    parts.push('no people, no faces, no human figures');
    if (negToggles.noLogo)      parts.push('no logos, no brand marks, no symbols');
    if (negToggles.noWatermark) parts.push('no watermarks, no stamps');
    if (negCustom.trim())       parts.push(negCustom.trim());
    return parts.join(', ');
  }, [negToggles, negCustom]);

  const handleGenerate = useCallback(async () => {
    if (!apiKey.trim())  { setError('Gemini APIキーを入力してください'); return; }
    if (!inputText.trim()) { setError('テキストまたはURLを入力してください'); return; }

    setLoading(true);
    setError('');
    setGeneratedImages([]);

    try {
      let analysisText = inputText;

      // URLモード: コンテンツを取得・解析
      if (inputMode === 'url') {
        setLoadingIndex(0);
        const videoId = extractYouTubeVideoId(inputText);

        if (videoId) {
          // YouTube: サムネイルを分析して背景生成に使う
          const { description, thumbnail } = await analyzeYoutubeThumbnail(videoId, apiKey);
          analysisText = description;
          // サムネイルを参考画像として先頭に追加（ユーザーの参考画像は後ろに）
          const refs = [thumbnail.dataUrl, locationRef, itemsRef, characterRef].filter(Boolean);

          const basePrompt = buildPrompt({ inputText: analysisText, imageType, illustrationStyle, theme, atmosphere, mainColor, useColor, location, items, character });
          const negativePrompt = buildNegativePrompt();
          const finalPrompt = negativePrompt ? `${basePrompt}. Negative: ${negativePrompt}` : basePrompt;

          const results = [];
          for (let i = 0; i < variationCount; i++) {
            setLoadingIndex(i + 1);
            const dataUrl = await generateImage({ prompt: finalPrompt, apiKey, aspectRatio, referenceImages: refs });
            results.push({ id: Date.now() + i, dataUrl });
            setGeneratedImages([...results]);
          }

          const settings = { inputText: analysisText, imageType, illustrationStyle, theme, atmosphere, aspectRatio };
          let updatedHistory = history;
          for (const r of results) updatedHistory = await addToHistory(r.dataUrl, settings);
          setHistory(updatedHistory);
          return; // 以降の共通処理をスキップ
        } else {
          // 通常URL: テキスト解析
          const urlContent = await fetchUrlContent(inputText);
          analysisText = await analyzeContent(
            urlContent || `Website: ${inputText}`,
            apiKey
          );
        }
      }

      // プロンプトを構築
      const basePrompt = buildPrompt({
        inputText: analysisText,
        imageType,
        illustrationStyle,
        theme,
        atmosphere,
        mainColor,
        useColor,
        location,
        items,
        character,
      });

      const negativePrompt = buildNegativePrompt();
      const finalPrompt = negativePrompt
        ? `${basePrompt}. Negative: ${negativePrompt}`
        : basePrompt;

      // 参考画像をまとめる
      const refs = [locationRef, itemsRef, characterRef].filter(Boolean);

      // バリエーション生成
      const results = [];
      for (let i = 0; i < variationCount; i++) {
        setLoadingIndex(i + 1);
        const dataUrl = await generateImage({
          prompt: finalPrompt,
          apiKey,
          aspectRatio,
          referenceImages: refs,
        });
        results.push({ id: Date.now() + i, dataUrl });
        setGeneratedImages([...results]);
      }

      // 履歴に保存
      const settings = { inputText: analysisText, imageType, illustrationStyle, theme, atmosphere, aspectRatio };
      let updatedHistory = history;
      for (const r of results) {
        updatedHistory = await addToHistory(r.dataUrl, settings);
      }
      setHistory(updatedHistory);

    } catch (e) {
      setError(e.message || '生成中にエラーが発生しました');
    } finally {
      setLoading(false);
      setLoadingIndex(0);
    }
  }, [
    apiKey, inputMode, inputText, imageType, illustrationStyle,
    theme, atmosphere, mainColor, useColor,
    location, items, character,
    locationRef, itemsRef, characterRef,
    negToggles, negCustom,
    variationCount, aspectRatio,
    buildNegativePrompt, history,
  ]);

  const downloadImage = (dataUrl, index) => {
    saveAs(dataUrl, `backdrop_${Date.now()}_${index + 1}.jpg`);
  };

  const downloadAll = async () => {
    if (generatedImages.length === 0) return;
    const zip = new JSZip();
    const folder = zip.folder('backdrops');
    generatedImages.forEach((img, i) => {
      folder.file(`backdrop_${i + 1}.jpg`, img.dataUrl.split(',')[1], { base64: true });
    });
    saveAs(await zip.generateAsync({ type: 'blob' }), `backdrops_${Date.now()}.zip`);
  };

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  const toggleNeg = (key) => setNegToggles(prev => ({ ...prev, [key]: !prev[key] }));

  // アスペクト比に応じたプレビュースタイル
  const previewAspect = aspectRatio.replace(':', '/');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">

      {/* ヘッダー */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
              <ImageIcon size={16} />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">Backdrop AI</h1>
              <p className="text-[11px] text-gray-400 mt-0.5">フリー背景画像ジェネレーター</p>
            </div>
          </div>

          {/* APIキー入力 */}
          <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2">
            <Key size={13} className="text-gray-400 flex-shrink-0" />
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Gemini API Key"
              className="bg-transparent text-sm text-white placeholder-gray-500 outline-none w-52"
            />
            <button onClick={() => setShowKey(!showKey)} className="text-gray-400 hover:text-white transition-colors">
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>
      </header>

      {/* メインレイアウト */}
      <div className="max-w-7xl mx-auto p-6 flex gap-6 items-start">

        {/* ===== 左パネル: 設定 ===== */}
        <div className="w-72 flex-shrink-0 space-y-4">

          {/* 入力モード */}
          <SectionCard>
            <div className="flex bg-gray-800 rounded-xl p-1 mb-3">
              {[
                { id: 'text', label: 'テキスト', icon: <Type size={12} /> },
                { id: 'url',  label: 'URL',      icon: <Link size={12} /> },
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setInputMode(mode.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm transition-colors ${
                    inputMode === mode.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {mode.icon}{mode.label}
                </button>
              ))}
            </div>

            {inputMode === 'text' ? (
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="背景のイメージを入力&#13;&#10;例：東京の夜景、抽象的な波模様、カフェの窓際"
                className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl p-3 text-sm resize-none outline-none border border-gray-700 focus:border-indigo-500 transition-colors"
                rows={3}
              />
            ) : (
              <>
                <input
                  type="url"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... または https://example.com"
                  className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl p-3 text-sm outline-none border border-gray-700 focus:border-indigo-500 transition-colors"
                />

                {/* YouTubeサムネイルプレビュー */}
                {youtubeThumbnail && (
                  <div className="mt-2 rounded-xl overflow-hidden relative">
                    <img
                      src={youtubeThumbnail.dataUrl}
                      alt="YouTube thumbnail"
                      className="w-full aspect-video object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-2">
                      <span className="text-[10px] text-white bg-red-600 px-1.5 py-0.5 rounded font-bold">YouTube</span>
                      <span className="text-[10px] text-gray-200 ml-2">サムネイルを背景の参考に使用</span>
                    </div>
                  </div>
                )}

                {/* YouTube URL検出中のローディング */}
                {inputMode === 'url' && extractYouTubeVideoId(inputText) && !youtubeThumbnail && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 size={11} className="animate-spin" />
                    サムネイルを読み込み中...
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* 画像タイプ */}
          <SectionCard title="タイプ">
            <div className="flex gap-2 mb-3">
              {[
                { id: 'photo',        label: '📷 実写' },
                { id: 'illustration', label: '🎨 イラスト' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setImageType(t.id)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    imageType === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {imageType === 'illustration' && (
              <div className="grid grid-cols-2 gap-1.5">
                {ILLUSTRATION_STYLES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setIllustrationStyle(s.id)}
                    className={`py-1.5 px-2 rounded-lg text-xs transition-colors text-left ${
                      illustrationStyle === s.id
                        ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* アスペクト比 */}
          <SectionCard title="サイズ">
            <div className="grid grid-cols-4 gap-2">
              {ASPECT_RATIOS.map(r => (
                <button
                  key={r.id}
                  onClick={() => setAspectRatio(r.id)}
                  className={`py-2 rounded-xl text-center transition-colors ${
                    aspectRatio === r.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  <div className="text-xs font-bold">{r.label}</div>
                  <div className="text-[9px] opacity-70 mt-0.5">{r.desc}</div>
                </button>
              ))}
            </div>
          </SectionCard>

          {/* テーマ */}
          <SectionCard title="テーマ / テイスト">
            <div className="grid grid-cols-2 gap-1.5">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`py-2 px-3 rounded-xl text-sm text-left transition-colors ${
                    theme === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* 雰囲気・時間帯 */}
          <SectionCard title="雰囲気 / 時間帯">
            <div className="grid grid-cols-3 gap-1.5">
              {ATMOSPHERES.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAtmosphere(a.id)}
                  className={`py-2 rounded-xl text-xs text-center transition-colors ${
                    atmosphere === a.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* メインカラー */}
          <SectionCard title="メインカラー">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">カラー指定</span>
              <Toggle enabled={useColor} onToggle={() => setUseColor(!useColor)} />
            </div>
            {useColor && (
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={mainColor}
                  onChange={e => setMainColor(e.target.value)}
                  className="w-12 h-10 rounded-xl cursor-pointer"
                />
                <div>
                  <div className="text-sm font-mono text-white">{mainColor}</div>
                  <div className="text-xs text-gray-500">ベースカラー</div>
                </div>
                <div
                  className="flex-1 h-10 rounded-xl border border-gray-700"
                  style={{ background: `linear-gradient(135deg, ${mainColor}aa, ${mainColor})` }}
                />
              </div>
            )}
          </SectionCard>

          {/* 詳細設定: 場所・アイテム・キャラ */}
          <SectionCard title="詳細設定">
            <div className="space-y-4">

              {/* 場所 */}
              <div>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                  <MapPin size={11} className="text-indigo-400" />
                  場所 / シーン
                </label>
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="例：東京の繁華街、森の中、海辺"
                  className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl p-2.5 text-sm outline-none border border-gray-700 focus:border-indigo-500 transition-colors mb-2"
                />
                <RefImageUpload value={locationRef} onChange={setLocationRef} />
              </div>

              {/* アイテム */}
              <div>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                  <Package size={11} className="text-indigo-400" />
                  アイテム / オブジェクト
                </label>
                <input
                  value={items}
                  onChange={e => setItems(e.target.value)}
                  placeholder="例：本とコーヒー、花、ノートPC"
                  className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl p-2.5 text-sm outline-none border border-gray-700 focus:border-indigo-500 transition-colors mb-2"
                />
                <RefImageUpload value={itemsRef} onChange={setItemsRef} />
              </div>

              {/* キャラクター */}
              <div>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                  <User size={11} className="text-indigo-400" />
                  キャラクター
                </label>
                <input
                  value={character}
                  onChange={e => setCharacter(e.target.value)}
                  placeholder="例：スーツの女性、ロボット、猫"
                  className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl p-2.5 text-sm outline-none border border-gray-700 focus:border-indigo-500 transition-colors mb-2"
                />
                <RefImageUpload value={characterRef} onChange={setCharacterRef} />
              </div>
            </div>
          </SectionCard>

          {/* 除外設定 */}
          <SectionCard title="除外設定">
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { key: 'noText',      label: '文字なし' },
                { key: 'noPeople',   label: '人物なし' },
                { key: 'noLogo',     label: 'ロゴなし' },
                { key: 'noWatermark', label: '透かしなし' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => toggleNeg(key)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                    negToggles[key]
                      ? 'bg-red-900/40 text-red-300 border border-red-700/50'
                      : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                  }`}
                >
                  {negToggles[key] ? '✓ ' : ''}{label}
                </button>
              ))}
            </div>
            <textarea
              value={negCustom}
              onChange={e => setNegCustom(e.target.value)}
              placeholder="その他の除外指示（英語推奨）"
              className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl p-2.5 text-xs resize-none outline-none border border-gray-700 focus:border-indigo-500 transition-colors"
              rows={2}
            />
          </SectionCard>

          {/* バリエーション数 */}
          <SectionCard title="バリエーション数">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">一度に生成する枚数</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setVariationCount(v => Math.max(1, v - 1))}
                  className="w-7 h-7 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-700 text-gray-300"
                >
                  <Minus size={13} />
                </button>
                <span className="text-xl font-bold text-white w-5 text-center">{variationCount}</span>
                <button
                  onClick={() => setVariationCount(v => Math.min(4, v + 1))}
                  className="w-7 h-7 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-700 text-gray-300"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ===== 右パネル: プレビュー & 履歴 ===== */}
        <div className="flex-1 min-w-0">

          {/* 生成ボタン */}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-indigo-900 disabled:text-indigo-400 text-white rounded-2xl font-semibold text-base flex items-center justify-center gap-2.5 transition-colors mb-5 shadow-lg shadow-indigo-900/30"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                生成中... ({loadingIndex}/{variationCount}枚目)
              </>
            ) : (
              <>
                <Sparkles size={18} />
                背景画像を生成
              </>
            )}
          </button>

          {/* エラー表示 */}
          {error && (
            <div className="mb-5 bg-red-900/30 border border-red-700/50 rounded-xl p-3.5 flex items-start gap-2.5 text-red-300 text-sm">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 生成結果 */}
          {generatedImages.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5 mb-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-200">生成結果 ({generatedImages.length}枚)</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={11} />
                    再生成
                  </button>
                  {generatedImages.length > 1 && (
                    <button
                      onClick={downloadAll}
                      className="flex items-center gap-1.5 text-xs bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-600/30 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Download size={11} />
                      ZIP一括DL
                    </button>
                  )}
                </div>
              </div>

              <div className={`grid gap-4 ${generatedImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {generatedImages.map((img, i) => (
                  <div key={img.id} className="relative group rounded-xl overflow-hidden bg-gray-800">
                    <img
                      src={img.dataUrl}
                      alt={`Generated ${i + 1}`}
                      className="w-full object-cover"
                      style={{ aspectRatio: previewAspect }}
                    />
                    {/* ホバーオーバーレイ */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={() => downloadImage(img.dataUrl, i)}
                        className="flex items-center gap-2 bg-white text-gray-900 px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors shadow-lg"
                      >
                        <Download size={14} />
                        ダウンロード
                      </button>
                    </div>
                    {/* バッジ */}
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">
                      #{i + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 空状態 */}
          {generatedImages.length === 0 && !loading && (
            <div className="bg-gray-900 rounded-2xl p-16 text-center mb-5">
              <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ImageIcon size={28} className="text-gray-600" />
              </div>
              <p className="text-gray-500 text-sm leading-relaxed">
                左パネルで設定を入力して<br />
                「背景画像を生成」をクリックしてください
              </p>
            </div>
          )}

          {/* ローディング中のプレースホルダー */}
          {loading && generatedImages.length === 0 && (
            <div className="bg-gray-900 rounded-2xl p-5 mb-5">
              <div className={`grid gap-4 ${variationCount === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {Array.from({ length: variationCount }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-gray-800 rounded-xl animate-pulse flex items-center justify-center"
                    style={{ aspectRatio: previewAspect }}
                  >
                    <Loader2 size={24} className="text-gray-600 animate-spin" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 生成履歴 */}
          {history.length > 0 && (
            <div className="bg-gray-900 rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                  <History size={14} />
                  生成履歴 ({history.length}/{MAX_HISTORY})
                </div>
                {showHistory ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>

              {showHistory && (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {history.map(item => (
                      <div key={item.id} className="relative group rounded-lg overflow-hidden bg-gray-800">
                        <img
                          src={item.thumbnail || item.imageDataUrl}
                          alt="history"
                          className="w-full aspect-video object-cover"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            onClick={() => saveAs(item.imageDataUrl, `backdrop_history_${item.id}.jpg`)}
                            className="bg-white text-gray-900 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            title="ダウンロード"
                          >
                            <Download size={12} />
                          </button>
                        </div>
                        {/* タイムスタンプ */}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                          <p className="text-[9px] text-gray-300 truncate">
                            {item.settings?.theme || ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={clearHistory}
                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Trash2 size={11} />
                    履歴をクリア
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
