/**
 * 山岡流・発音記号正規化エンジン (GAS移植版)
 */
function normalizePhonetic_GAS(str) {
  if (!str) return "";
  return str.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/ɔ/g, "o")
            .replace(/ɛ/g, "e")
            .replace(/ɯ/g, "u")
            .replace(/ə/g, "o")
            .replace(/[- ]/g, "")
            .replace(/ph/g, "p")
            .replace(/th/g, "t")
            .replace(/kh/g, "k")
            .replace(/ng/g, "n")
            .replace(/[’']/g, "")
            .replace(/y$/g, "i");
}

/**
 * 日本語検索用の正規化エンジン (GAS移植版)
 */
function normalizeJapanese_GAS(str) {
  if (!str) return "";
  return str
    .replace(/[\u30a1-\u30f6]/g, function(s) {
      return String.fromCharCode(s.charCodeAt(0) - 0x60);
    })
    .replace(/ー/g, "")
    .replace(/[する|した|したこと]$/, "")
    .trim();
}

/**
 * 検索エンジン（スコアリング＆完全一致ボーナス搭載版）
 */
function searchVocabularyForLine(keyword) {
  const allData = getRawVocabulary(); 
  if (!allData || allData.length === 0) return [];

  const q = keyword.trim();
  if (q === '') return [];

  const keywords = q.split(/[\s ]+/).filter(k => k.length > 0);
  const normalizedKeywords = keywords.map(kw => normalizePhonetic_GAS(kw));
  const normalizedJapaneseKeywords = keywords.map(kw => normalizeJapanese_GAS(kw));
  const qLower = q.toLowerCase();

  // スコアリングループ
  const scoredData = allData.map(v => {
    let score = 0;
    const th = String(v.word_th || "").toLowerCase();
    const rawPh = String(v.phonetic || "").toLowerCase();
    const cat = String(v.category || "").toLowerCase();
    const exp = String(v.explanation || "").toLowerCase();
    const exTh = String(v.example_th || "").toLowerCase();
    const exJa = String(v.example_ja || "").toLowerCase();

    // カテゴリーボーナス
    const cleanCatsArr = cat.replace(/\d+\.\s*/g, '').split(/[\n\r\/]+/).map(c => c.trim());
    if (cleanCatsArr.includes(qLower) || cleanCatsArr.some(c => c.startsWith(qLower))) {
      score += 10000;
    }

    const normPh = normalizePhonetic_GAS(rawPh);
    const ja   = String(v.meaning_ja || ""); 
    const kana = normalizeJapanese_GAS(String(v.meaning_kana || ""));

    const isMatch = keywords.every((kw, i) => {
      const nKw = normalizedKeywords[i];
      const kJ = normalizedJapaneseKeywords[i]; 
      
      const matchTh = th.includes(kw);
      const matchJa = ja.includes(kw);
      const matchKana = kana.includes(kJ);
      const matchCat = cat.includes(kw);
      const matchExp = exp.includes(kw);
      const matchPh = normPh.includes(nKw);
      const matchEx = exTh.includes(kw) || exJa.includes(kw);

      // 短い単語の「完全一致」を最優先で拾う山岡流ボーナス
      if (matchTh) {
        score += 500;
        if (th.length === kw.length) score += 5000;
        else if (th.length - kw.length <= 2) score += 1000;
      }
      if (matchJa) {
        score += 600;
        if (ja.length === kw.length) score += 5000;
      }
      if (matchKana) score += 400; 
      if (matchCat) score += 800; 
      if (matchExp) score += 300; 
      if (matchEx) score += 200;
      
      if (matchPh) {
        if (normPh === nKw) score += 2000;      
        else if (normPh.startsWith(nKw)) score += 1000; 
        else score += 500;
      }

      return (matchTh || matchJa || matchKana || matchPh || matchCat || matchExp || matchEx);
    });

    return { ...v, matchScore: isMatch ? score : 0 };
  });

  // スコア順にソートし、上位10件を返す
  const hits = scoredData.filter(v => v.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore);
  return hits.slice(0, 10);
}

/**
 * Flex Message生成（maxLines撤廃＆最後まで表示版）
 */
function buildFlexMessage(results, keyword) {
  if (!results || results.length === 0) {
    return {
      type: "text",
      text: `「${keyword}」は見つかりませんでした😢`
    };
  }

  const bubbles = results.map(item => {
    return {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: item.word_th || "不明",
                weight: "bold",
                size: "xl",
                color: "#06C755",
                wrap: true
              },
              {
                type: "text",
                text: item.phonetic || "---",
                size: "sm",
                color: "#888888",
                wrap: true
              }
            ]
          },
          {
            type: "text",
            text: item.meaning_ja || "意味が登録されていません",
            weight: "bold",
            size: "lg",
            color: "#111111",
            wrap: true,
            margin: "md"
          },
          {
            type: "separator",
            margin: "md"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: item.example_th || "例文がありません",
                wrap: true,
                size: "sm",
                color: "#333333"
              },
              {
                type: "text",
                text: item.example_ja || "",
                wrap: true,
                size: "xs",
                color: "#666666"
              }
            ]
          },
          {
            type: "separator",
            margin: "md"
          },
          {
            type: "text",
            text: item.explanation || "解説がありません",
            wrap: true, // 折り返しを有効化
            size: "xs",
            color: "#888888",
            margin: "md"
            // ★ maxLines: 6 を削除したため、途切れることなく最後まで表示されます！
          }
        ]
      }
    };
  });

  if (bubbles.length === 1) {
    return {
      type: "flex",
      altText: `【検索結果】${results[0].word_th}`,
      contents: bubbles[0]
    };
  } else {
    return {
      type: "flex",
      altText: `「${keyword}」の検索結果（${bubbles.length}件）`,
      contents: {
        type: "carousel",
        contents: bubbles
      }
    };
  }
}