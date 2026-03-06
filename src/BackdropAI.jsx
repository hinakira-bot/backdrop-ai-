import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Download, ImageIcon, Link, Type, Sparkles,
  History, ChevronDown, ChevronUp, X, Plus, Minus,
  MapPin, Package, User, AlertCircle,
  Loader2, Key, Eye, EyeOff, Trash2, RefreshCw,
  Shuffle, Save, Copy, Check, BookMarked, Pencil,
} from 'lucide-react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import {
  analyzeContent, fetchUrlContent, generateImage,
  extractYouTubeVideoId, fetchYouTubeThumbnail, analyzeYoutubeThumbnail,
} from './geminiClient';

// ===== 定数 =====

const IMAGE_TYPES = [
  { id: 'photo',    label: '📷 実写',       en: 'Photorealistic professional background photograph, high quality DSLR photography' },
  { id: 'illust',   label: '🎨 イラスト',   en: null }, // サブスタイル選択
  { id: '3dcg',     label: '🖥️ 3DCG',      en: 'Professional 3D CGI rendered background, photorealistic 3D visualization, studio quality 3D render' },
  { id: 'texture',  label: '🪨 テクスチャ', en: 'High-resolution seamless background texture, abstract surface material, detailed pattern' },
  { id: 'abstract', label: '✨ アブストラクト', en: 'Abstract art background, fluid dynamic shapes, flowing geometric forms, artistic abstract composition' },
];

const ILLUSTRATION_STYLES = [
  { id: 'digital',    label: 'デジタルアート', en: 'digital painting, vibrant digital art illustration' },
  { id: 'watercolor', label: '水彩',          en: 'watercolor painting, soft edges, artistic brush strokes, delicate washes' },
  { id: 'flat',       label: 'フラット',       en: 'flat design illustration, geometric shapes, clean vector style' },
  { id: 'anime',      label: 'アニメ/マンガ',  en: 'anime illustration, manga art style, Japanese animation aesthetic' },
  { id: 'sketch',     label: 'スケッチ',       en: 'detailed pencil sketch, hand-drawn illustration, fine line art' },
];

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
  { id: 'morning', label: '朝',     en: 'early morning, soft golden sunrise light, calm peaceful atmosphere' },
  { id: 'daytime', label: '昼',     en: 'bright midday, clear natural light, vivid colors' },
  { id: 'sunset',  label: '夕暮れ', en: 'sunset golden hour, warm orange pink light, dramatic colorful sky' },
  { id: 'night',   label: '夜',     en: 'night time, moonlight, stars, dark atmospheric, glowing city lights' },
  { id: 'cloudy',  label: '曇り',   en: 'overcast cloudy sky, soft diffused light, muted tones' },
  { id: 'foggy',   label: '霧・靄', en: 'misty foggy atmosphere, ethereal, mysterious soft light' },
  { id: 'rainy',   label: '雨',     en: 'rainy weather, wet surfaces, reflections on ground, moody rain drops' },
  { id: 'sunny',   label: '晴天',   en: 'bright sunny day, clear blue sky, vibrant energetic light' },
  { id: 'none',    label: 'なし',   en: '' },
];

const ASPECT_RATIOS = [
  { id: '16:9', label: '16:9', desc: 'スタンダード' },
  { id: '4:3',  label: '4:3',  desc: 'クラシック' },
  { id: '1:1',  label: '1:1',  desc: '正方形' },
  { id: '9:16', label: '9:16', desc: '縦長' },
];

const HISTORY_KEY  = 'backdropai_history';
const PRESETS_KEY  = 'backdropai_presets';
const MAX_HISTORY  = 10;
const MAX_PRESETS  = 12;

// ===== ユーティリティ =====

function buildPrompt({ inputText, imageType, illustrationStyle, theme, atmosphere, mainColor, useColor, location, items, character }) {
  const parts = [];

  // スタイル
  const typeObj = IMAGE_TYPES.find(t => t.id === imageType);
  if (imageType === 'illust') {
    const style = ILLUSTRATION_STYLES.find(s => s.id === illustrationStyle);
    parts.push(`Professional ${style?.en || 'digital illustration'} background artwork`);
  } else {
    parts.push(typeObj?.en || 'Professional background image');
  }

  if (inputText) parts.push(`Visual theme: ${inputText}`);

  const themeObj = THEMES.find(t => t.id === theme);
  if (themeObj) parts.push(`Aesthetic: ${themeObj.en}`);

  const atmObj = ATMOSPHERES.find(a => a.id === atmosphere);
  if (atmObj?.en) parts.push(`Atmosphere: ${atmObj.en}`);

  if (useColor && mainColor) parts.push(`Primary color palette: ${mainColor}, harmonious complementary colors`);
  if (location)  parts.push(`Scene/Location: ${location}`);
  if (items)     parts.push(`Featured objects/elements: ${items}`);
  if (character) parts.push(`Characters: ${character}`);

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
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

async function addToHistory(imageDataUrl, settings) {
  try {
    const history = loadHistory();
    const thumbnail = await compressToThumbnail(imageDataUrl);
    const updated = [{ id: Date.now(), thumbnail, imageDataUrl, settings, timestamp: new Date().toISOString() }, ...history].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch { return loadHistory(); }
}

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); }
  catch { return []; }
}

function savePresets(presets) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
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
          <button onClick={() => onChange(null)} className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <X size={11} />
          </button>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} className="w-full h-12 border border-dashed border-gray-600 rounded-lg text-gray-500 text-xs hover:border-indigo-500 hover:text-indigo-400 transition-colors flex items-center justify-center gap-1.5">
          <Plus size={12} />参考画像
        </button>
      )}
    </div>
  );
}

function SectionCard({ title, desc, children }) {
  return (
    <div className="bg-gray-900 rounded-2xl p-4">
      {title && (
        <h3 className={`text-[11px] font-semibold text-gray-400 uppercase tracking-wider ${desc ? 'mb-1' : 'mb-3'}`}>
          {title}
        </h3>
      )}
      {desc && <p className="text-[10px] text-gray-500 leading-relaxed mb-3">{desc}</p>}
      {children}
    </div>
  );
}

function Toggle({ enabled, onToggle }) {
  return (
    <button onClick={onToggle} className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${enabled ? 'bg-indigo-600' : 'bg-gray-700'}`}>
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ===== メインコンポーネント =====

export default function BackdropAI() {
  // APIキー
  const [apiKey,   setApiKey]   = useState(() => localStorage.getItem('backdropai_key') || '');
  const [showKey,  setShowKey]  = useState(false);

  // 入力
  const [inputMode,        setInputMode]        = useState('text');
  const [inputText,        setInputText]        = useState('');
  const [youtubeThumbnail, setYoutubeThumbnail] = useState(null);

  // 画像タイプ
  const [imageType,         setImageType]         = useState('photo');
  const [illustrationStyle, setIllustrationStyle] = useState('digital');

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
  const [negToggles, setNegToggles] = useState({ noText: true, noPeople: false, noLogo: true, noWatermark: true });
  const [negCustom,  setNegCustom]  = useState('');

  // 生成
  const [variationCount,  setVariationCount]  = useState(2);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [loadingIndex,    setLoadingIndex]    = useState(0);
  const [error,           setError]           = useState('');

  // ① プロンプト表示・編集
  const [lastPrompt,       setLastPrompt]       = useState('');
  const [editPrompt,       setEditPrompt]       = useState('');
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  // ② プリセット
  const [presets,         setPresets]         = useState(() => loadPresets());
  const [showPresets,     setShowPresets]     = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [showPresetInput, setShowPresetInput] = useState(false);

  // ③ クリップボードコピー
  const [copiedId, setCopiedId] = useState(null);

  // 履歴
  const [history,     setHistory]     = useState(() => loadHistory());
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (apiKey) localStorage.setItem('backdropai_key', apiKey);
  }, [apiKey]);

  // YouTube URL検出 → サムネ自動取得
  useEffect(() => {
    if (inputMode !== 'url') { setYoutubeThumbnail(null); return; }
    const videoId = extractYouTubeVideoId(inputText);
    if (!videoId) { setYoutubeThumbnail(null); return; }
    if (youtubeThumbnail?.videoId === videoId) return;
    setYoutubeThumbnail(null);
    fetchYouTubeThumbnail(videoId)
      .then(thumb => setYoutubeThumbnail({ dataUrl: thumb.dataUrl, videoId }))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, inputMode]);

  const buildNegativePrompt = useCallback(() => {
    const parts = [];
    if (negToggles.noText)      parts.push('no text, no typography, no lettering');
    if (negToggles.noPeople)    parts.push('no people, no faces, no human figures');
    if (negToggles.noLogo)      parts.push('no logos, no brand marks, no symbols');
    if (negToggles.noWatermark) parts.push('no watermarks, no stamps');
    if (negCustom.trim())       parts.push(negCustom.trim());
    return parts.join(', ');
  }, [negToggles, negCustom]);

  // ④ ランダム探索
  const randomize = useCallback(() => {
    setTheme(THEMES[Math.floor(Math.random() * THEMES.length)].id);
    const atms = ATMOSPHERES.filter(a => a.id !== 'none');
    setAtmosphere(atms[Math.floor(Math.random() * atms.length)].id);
    const typeId = IMAGE_TYPES[Math.floor(Math.random() * IMAGE_TYPES.length)].id;
    setImageType(typeId);
    if (typeId === 'illust') {
      setIllustrationStyle(ILLUSTRATION_STYLES[Math.floor(Math.random() * ILLUSTRATION_STYLES.length)].id);
    }
  }, []);

  // ③ クリップボードコピー
  const copyToClipboard = useCallback(async (dataUrl, id) => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // フォールバック: リンクコピー
      await navigator.clipboard.writeText(dataUrl);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  // ② プリセット操作
  const handleSavePreset = useCallback(() => {
    const name = presetNameInput.trim();
    if (!name) return;
    const preset = {
      id: Date.now(), name,
      imageType, illustrationStyle, aspectRatio, theme, atmosphere,
      mainColor, useColor, location, items, character,
      negToggles, negCustom, variationCount,
    };
    const updated = [preset, ...presets].slice(0, MAX_PRESETS);
    setPresets(updated);
    savePresets(updated);
    setPresetNameInput('');
    setShowPresetInput(false);
  }, [presetNameInput, imageType, illustrationStyle, aspectRatio, theme, atmosphere, mainColor, useColor, location, items, character, negToggles, negCustom, variationCount, presets]);

  const handleLoadPreset = useCallback((preset) => {
    setImageType(preset.imageType);
    setIllustrationStyle(preset.illustrationStyle);
    setAspectRatio(preset.aspectRatio);
    setTheme(preset.theme);
    setAtmosphere(preset.atmosphere);
    setMainColor(preset.mainColor);
    setUseColor(preset.useColor);
    setLocation(preset.location || '');
    setItems(preset.items || '');
    setCharacter(preset.character || '');
    setNegToggles(preset.negToggles);
    setNegCustom(preset.negCustom || '');
    setVariationCount(preset.variationCount);
    setShowPresets(false);
  }, []);

  const handleDeletePreset = useCallback((id) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    savePresets(updated);
  }, [presets]);

  // 画像生成（共通処理）
  const runGeneration = useCallback(async (finalPrompt, refs) => {
    const results = [];
    for (let i = 0; i < variationCount; i++) {
      setLoadingIndex(i + 1);
      const dataUrl = await generateImage({ prompt: finalPrompt, apiKey, aspectRatio, referenceImages: refs });
      results.push({ id: Date.now() + i, dataUrl });
      setGeneratedImages([...results]);
    }
    const settings = { imageType, illustrationStyle, theme, atmosphere, aspectRatio };
    let updatedHistory = history;
    for (const r of results) updatedHistory = await addToHistory(r.dataUrl, settings);
    setHistory(updatedHistory);
  }, [variationCount, apiKey, aspectRatio, imageType, illustrationStyle, theme, atmosphere, history]);

  // ① プロンプト編集後に再生成
  const handleRegenerateWithPrompt = useCallback(async () => {
    if (!editPrompt.trim()) return;
    setLoading(true);
    setError('');
    setGeneratedImages([]);
    try {
      const refs = [locationRef, itemsRef, characterRef].filter(Boolean);
      await runGeneration(editPrompt, refs);
    } catch (e) {
      setError(e.message || '生成中にエラーが発生しました');
    } finally {
      setLoading(false);
      setLoadingIndex(0);
    }
  }, [editPrompt, locationRef, itemsRef, characterRef, runGeneration]);

  const handleGenerate = useCallback(async () => {
    if (!apiKey.trim())    { setError('Gemini APIキーを入力してください'); return; }
    if (!inputText.trim()) { setError('テキストまたはURLを入力してください'); return; }

    setLoading(true);
    setError('');
    setGeneratedImages([]);

    try {
      let analysisText = inputText;
      let refs = [locationRef, itemsRef, characterRef].filter(Boolean);

      if (inputMode === 'url') {
        setLoadingIndex(0);
        const videoId = extractYouTubeVideoId(inputText);

        if (videoId) {
          const { description, thumbnail } = await analyzeYoutubeThumbnail(videoId, apiKey);
          analysisText = description;
          refs = [thumbnail.dataUrl, ...refs]; // サムネを先頭に追加
        } else {
          const urlContent = await fetchUrlContent(inputText);
          analysisText = await analyzeContent(urlContent || `Website: ${inputText}`, apiKey);
        }
      }

      const basePrompt = buildPrompt({ inputText: analysisText, imageType, illustrationStyle, theme, atmosphere, mainColor, useColor, location, items, character });
      const negativePrompt = buildNegativePrompt();
      const finalPrompt = negativePrompt ? `${basePrompt}. Negative: ${negativePrompt}` : basePrompt;

      // ① プロンプトを保存（表示・編集用）
      setLastPrompt(finalPrompt);
      setEditPrompt(finalPrompt);

      await runGeneration(finalPrompt, refs);

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
    buildNegativePrompt, runGeneration,
  ]);

  const downloadImage = (dataUrl, index) => saveAs(dataUrl, `backdrop_${Date.now()}_${index + 1}.jpg`);

  const downloadAll = async () => {
    if (generatedImages.length === 0) return;
    const zip = new JSZip();
    const folder = zip.folder('backdrops');
    generatedImages.forEach((img, i) => folder.file(`backdrop_${i + 1}.jpg`, img.dataUrl.split(',')[1], { base64: true }));
    saveAs(await zip.generateAsync({ type: 'blob' }), `backdrops_${Date.now()}.zip`);
  };

  const clearHistory = () => { localStorage.removeItem(HISTORY_KEY); setHistory([]); };
  const toggleNeg = (key) => setNegToggles(prev => ({ ...prev, [key]: !prev[key] }));
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

      <div className="max-w-7xl mx-auto p-6 flex gap-6 items-start">

        {/* ===== 左パネル ===== */}
        <div className="w-72 flex-shrink-0 space-y-4">

          {/* 入力モード */}
          <SectionCard desc="テキストで背景のイメージを指定するか、WebサイトやYouTube動画のURLから自動分析します">
            <div className="flex bg-gray-800 rounded-xl p-1 mb-3">
              {[{ id: 'text', label: 'テキスト', icon: <Type size={12} /> }, { id: 'url', label: 'URL', icon: <Link size={12} /> }].map(m => (
                <button key={m.id} onClick={() => setInputMode(m.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm transition-colors ${inputMode === m.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {m.icon}{m.label}
                </button>
              ))}
            </div>
            {inputMode === 'text' ? (
              <textarea value={inputText} onChange={e => setInputText(e.target.value)}
                placeholder="背景のイメージを入力&#13;&#10;例：東京の夜景、抽象的な波模様、カフェの窓際"
                className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl p-3 text-sm resize-none outline-none border border-gray-700 focus:border-indigo-500 transition-colors"
                rows={3} />
            ) : (
              <>
                <input type="url" value={inputText} onChange={e => setInputText(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... または https://example.com"
                  className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl p-3 text-sm outline-none border border-gray-700 focus:border-indigo-500 transition-colors" />
                {youtubeThumbnail && (
                  <div className="mt-2 rounded-xl overflow-hidden relative">
                    <img src={youtubeThumbnail.dataUrl} alt="YouTube thumbnail" className="w-full aspect-video object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-2">
                      <span className="text-[10px] text-white bg-red-600 px-1.5 py-0.5 rounded font-bold">YouTube</span>
                      <span className="text-[10px] text-gray-200 ml-2">サムネイルを背景の参考に使用</span>
                    </div>
                  </div>
                )}
                {inputMode === 'url' && extractYouTubeVideoId(inputText) && !youtubeThumbnail && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 size={11} className="animate-spin" />サムネイルを読み込み中...
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* 画像タイプ */}
          <SectionCard title="タイプ" desc="背景画像のビジュアルスタイルを選択します。イラストを選ぶとサブスタイルが表示されます">
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {IMAGE_TYPES.slice(0, 4).map(t => (
                <button key={t.id} onClick={() => setImageType(t.id)}
                  className={`py-2 px-2 rounded-xl text-xs font-medium text-center transition-colors ${imageType === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <button onClick={() => setImageType('abstract')}
              className={`w-full py-2 rounded-xl text-xs font-medium transition-colors ${imageType === 'abstract' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {IMAGE_TYPES[4].label}
            </button>
            {imageType === 'illust' && (
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {ILLUSTRATION_STYLES.map(s => (
                  <button key={s.id} onClick={() => setIllustrationStyle(s.id)}
                    className={`py-1.5 px-2 rounded-lg text-xs transition-colors text-left ${illustrationStyle === s.id ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* サイズ */}
          <SectionCard title="サイズ" desc="16:9はプレゼン・Web用、1:1はSNS用、9:16はストーリー・縦型コンテンツ用に最適です">
            <div className="grid grid-cols-4 gap-2">
              {ASPECT_RATIOS.map(r => (
                <button key={r.id} onClick={() => setAspectRatio(r.id)}
                  className={`py-2 rounded-xl text-center transition-colors ${aspectRatio === r.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  <div className="text-xs font-bold">{r.label}</div>
                  <div className="text-[9px] opacity-70 mt-0.5">{r.desc}</div>
                </button>
              ))}
            </div>
          </SectionCard>

          {/* テーマ */}
          <SectionCard title="テーマ / テイスト" desc="画像全体の美的スタイル・世界観を決定します。最も影響が大きい設定です">
            <div className="grid grid-cols-2 gap-1.5">
              {THEMES.map(t => (
                <button key={t.id} onClick={() => setTheme(t.id)}
                  className={`py-2 px-3 rounded-xl text-sm text-left transition-colors ${theme === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* 雰囲気 */}
          <SectionCard title="雰囲気 / 時間帯" desc="光・天候・時間帯でムードを調整します。「なし」を選ぶとAIに委ねます">
            <div className="grid grid-cols-3 gap-1.5">
              {ATMOSPHERES.map(a => (
                <button key={a.id} onClick={() => setAtmosphere(a.id)}
                  className={`py-2 rounded-xl text-xs text-center transition-colors ${atmosphere === a.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {a.label}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* メインカラー */}
          <SectionCard title="メインカラー" desc="ONにすると指定カラーを中心とした色調で生成します。ブランドカラーに合わせたい場合に便利です">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">カラー指定</span>
              <Toggle enabled={useColor} onToggle={() => setUseColor(!useColor)} />
            </div>
            {useColor && (
              <div className="flex items-center gap-3">
                <input type="color" value={mainColor} onChange={e => setMainColor(e.target.value)} className="w-12 h-10 rounded-xl cursor-pointer" />
                <div>
                  <div className="text-sm font-mono text-white">{mainColor}</div>
                  <div className="text-xs text-gray-500">ベースカラー</div>
                </div>
                <div className="flex-1 h-10 rounded-xl border border-gray-700" style={{ background: `linear-gradient(135deg, ${mainColor}aa, ${mainColor})` }} />
              </div>
            )}
          </SectionCard>

          {/* 詳細設定 */}
          <SectionCard title="詳細設定" desc="場所・物・キャラクターを具体的に指定できます。参考画像をアップすると視覚スタイルの一致度が上がります">
            <div className="space-y-4">
              {[
                { label: '場所 / シーン', icon: <MapPin size={11} className="text-indigo-400" />, value: location, onChange: setLocation, placeholder: '例：東京の繁華街、森の中、海辺', ref: locationRef, setRef: setLocationRef },
                { label: 'アイテム / オブジェクト', icon: <Package size={11} className="text-indigo-400" />, value: items, onChange: setItems, placeholder: '例：本とコーヒー、花、ノートPC', ref: itemsRef, setRef: setItemsRef },
                { label: 'キャラクター', icon: <User size={11} className="text-indigo-400" />, value: character, onChange: setCharacter, placeholder: '例：スーツの女性、ロボット、猫', ref: characterRef, setRef: setCharacterRef },
              ].map(({ label, icon, value, onChange, placeholder, ref, setRef }) => (
                <div key={label}>
                  <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">{icon}{label}</label>
                  <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                    className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl p-2.5 text-sm outline-none border border-gray-700 focus:border-indigo-500 transition-colors mb-2" />
                  <RefImageUpload value={ref} onChange={setRef} />
                </div>
              ))}
            </div>
          </SectionCard>

          {/* 除外設定 */}
          <SectionCard title="除外設定" desc="生成画像に含めたくない要素を指定します。フリー素材として使う場合は「文字なし・ロゴなし」を推奨します">
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[{ key: 'noText', label: '文字なし' }, { key: 'noPeople', label: '人物なし' }, { key: 'noLogo', label: 'ロゴなし' }, { key: 'noWatermark', label: '透かしなし' }].map(({ key, label }) => (
                <button key={key} onClick={() => toggleNeg(key)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${negToggles[key] ? 'bg-red-900/40 text-red-300 border border-red-700/50' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}>
                  {negToggles[key] ? '✓ ' : ''}{label}
                </button>
              ))}
            </div>
            <textarea value={negCustom} onChange={e => setNegCustom(e.target.value)}
              placeholder="その他の除外指示（英語推奨）"
              className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl p-2.5 text-xs resize-none outline-none border border-gray-700 focus:border-indigo-500 transition-colors"
              rows={2} />
          </SectionCard>

          {/* バリエーション数 */}
          <SectionCard title="バリエーション数" desc="同時に生成する枚数です。多いほど選択肢が増えますが時間がかかります（最大4枚）">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">一度に生成する枚数</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setVariationCount(v => Math.max(1, v - 1))} className="w-7 h-7 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-700 text-gray-300"><Minus size={13} /></button>
                <span className="text-xl font-bold text-white w-5 text-center">{variationCount}</span>
                <button onClick={() => setVariationCount(v => Math.min(4, v + 1))} className="w-7 h-7 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-700 text-gray-300"><Plus size={13} /></button>
              </div>
            </div>
          </SectionCard>

          {/* ② プリセット */}
          <div className="bg-gray-900 rounded-2xl overflow-hidden">
            <button onClick={() => setShowPresets(!showPresets)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <BookMarked size={12} />設定プリセット ({presets.length}/{MAX_PRESETS})
              </div>
              {showPresets ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
            </button>
            {showPresets && (
              <div className="px-4 pb-4 space-y-2">
                {/* 保存ボタン */}
                {!showPresetInput ? (
                  <button onClick={() => setShowPresetInput(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-600/30 rounded-xl text-xs transition-colors">
                    <Save size={11} />現在の設定を保存
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <input value={presetNameInput} onChange={e => setPresetNameInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                      placeholder="プリセット名"
                      className="flex-1 bg-gray-800 text-white placeholder-gray-500 rounded-lg px-2.5 py-1.5 text-xs outline-none border border-gray-700 focus:border-indigo-500"
                      autoFocus />
                    <button onClick={handleSavePreset} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs">保存</button>
                    <button onClick={() => { setShowPresetInput(false); setPresetNameInput(''); }} className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs"><X size={11} /></button>
                  </div>
                )}
                {/* プリセット一覧 */}
                {presets.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {presets.map(p => (
                      <div key={p.id} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
                        <span className="flex-1 text-xs text-gray-200 truncate">{p.name}</span>
                        <button onClick={() => handleLoadPreset(p)} className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors font-medium">適用</button>
                        <button onClick={() => handleDeletePreset(p.id)} className="text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={11} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ===== 右パネル ===== */}
        <div className="flex-1 min-w-0">

          {/* 生成ボタン + ④ ランダムボタン */}
          <div className="flex gap-3 mb-5">
            <button onClick={randomize} disabled={loading}
              className="flex items-center gap-2 px-4 py-4 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 rounded-2xl font-medium text-sm transition-colors flex-shrink-0"
              title="テーマ・雰囲気・タイプをランダム探索">
              <Shuffle size={16} />ランダム
            </button>
            <button onClick={handleGenerate} disabled={loading}
              className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-indigo-900 disabled:text-indigo-400 text-white rounded-2xl font-semibold text-base flex items-center justify-center gap-2.5 transition-colors shadow-lg shadow-indigo-900/30">
              {loading ? (
                <><Loader2 size={18} className="animate-spin" />生成中... ({loadingIndex}/{variationCount}枚目)</>
              ) : (
                <><Sparkles size={18} />背景画像を生成</>
              )}
            </button>
          </div>

          {/* エラー */}
          {error && (
            <div className="mb-5 bg-red-900/30 border border-red-700/50 rounded-xl p-3.5 flex items-start gap-2.5 text-red-300 text-sm">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}

          {/* 生成結果 */}
          {generatedImages.length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-200">生成結果 ({generatedImages.length}枚)</h2>
                <div className="flex items-center gap-2">
                  <button onClick={handleGenerate} disabled={loading}
                    className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                    <RefreshCw size={11} />再生成
                  </button>
                  {generatedImages.length > 1 && (
                    <button onClick={downloadAll}
                      className="flex items-center gap-1.5 text-xs bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-600/30 px-3 py-1.5 rounded-lg transition-colors">
                      <Download size={11} />ZIP一括DL
                    </button>
                  )}
                </div>
              </div>

              <div className={`grid gap-4 ${generatedImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {generatedImages.map((img, i) => (
                  <div key={img.id} className="relative group rounded-xl overflow-hidden bg-gray-800">
                    <img src={img.dataUrl} alt={`Generated ${i + 1}`} className="w-full object-cover" style={{ aspectRatio: previewAspect }} />
                    {/* ホバーオーバーレイ */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      {/* ③ クリップボードコピー */}
                      <button onClick={() => copyToClipboard(img.dataUrl, img.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-medium text-xs transition-colors shadow-lg ${copiedId === img.id ? 'bg-green-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}>
                        {copiedId === img.id ? <><Check size={13} />コピー済み</> : <><Copy size={13} />コピー</>}
                      </button>
                      <button onClick={() => downloadImage(img.dataUrl, i)}
                        className="flex items-center gap-2 bg-white text-gray-900 px-4 py-2 rounded-xl font-semibold text-xs hover:bg-gray-100 transition-colors shadow-lg">
                        <Download size={13} />DL
                      </button>
                    </div>
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">#{i + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ① プロンプト表示・編集 */}
          {lastPrompt && (
            <div className="bg-gray-900 rounded-2xl overflow-hidden mb-4">
              <button onClick={() => setShowPromptEditor(!showPromptEditor)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                  <Pencil size={13} />生成プロンプト（編集して再生成可）
                </div>
                {showPromptEditor ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
              </button>
              {showPromptEditor && (
                <div className="px-4 pb-4">
                  <textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)}
                    className="w-full bg-gray-800 text-gray-200 placeholder-gray-500 rounded-xl p-3 text-xs font-mono resize-none outline-none border border-gray-700 focus:border-indigo-500 transition-colors mb-3"
                    rows={5} />
                  <div className="flex gap-2">
                    <button onClick={handleRegenerateWithPrompt} disabled={loading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors">
                      <Sparkles size={12} />このプロンプトで再生成
                    </button>
                    <button onClick={() => setEditPrompt(lastPrompt)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs transition-colors">
                      <RefreshCw size={11} />リセット
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 空状態 */}
          {generatedImages.length === 0 && !loading && (
            <div className="bg-gray-900 rounded-2xl p-16 text-center mb-4">
              <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ImageIcon size={28} className="text-gray-600" />
              </div>
              <p className="text-gray-500 text-sm leading-relaxed">
                左パネルで設定を入力して<br />「背景画像を生成」をクリック
              </p>
            </div>
          )}

          {/* ローディングプレースホルダー */}
          {loading && generatedImages.length === 0 && (
            <div className="bg-gray-900 rounded-2xl p-5 mb-4">
              <div className={`grid gap-4 ${variationCount === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {Array.from({ length: variationCount }).map((_, i) => (
                  <div key={i} className="bg-gray-800 rounded-xl animate-pulse flex items-center justify-center" style={{ aspectRatio: previewAspect }}>
                    <Loader2 size={24} className="text-gray-600 animate-spin" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 履歴 */}
          {history.length > 0 && (
            <div className="bg-gray-900 rounded-2xl overflow-hidden">
              <button onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                  <History size={14} />生成履歴 ({history.length}/{MAX_HISTORY})
                </div>
                {showHistory ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>
              {showHistory && (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {history.map(item => (
                      <div key={item.id} className="relative group rounded-lg overflow-hidden bg-gray-800">
                        <img src={item.thumbnail || item.imageDataUrl} alt="history" className="w-full aspect-video object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                          <button onClick={() => copyToClipboard(item.imageDataUrl, `h_${item.id}`)}
                            className="bg-white/20 text-white p-1.5 rounded-lg hover:bg-white/30 transition-colors">
                            {copiedId === `h_${item.id}` ? <Check size={10} /> : <Copy size={10} />}
                          </button>
                          <button onClick={() => saveAs(item.imageDataUrl, `backdrop_history_${item.id}.jpg`)}
                            className="bg-white text-gray-900 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                            <Download size={10} />
                          </button>
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                          <p className="text-[9px] text-gray-300 truncate">{item.settings?.theme || ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={clearHistory} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors">
                    <Trash2 size={11} />履歴をクリア
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
