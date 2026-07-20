/**
 * ファイル名: line_bot.gs
 * 役割: LINE Messaging APIとの通信、およびFlex MessageのUI生成
 */

// LINE Developersで取得したチャネルアクセストークンをスクリプトプロパティに設定してください
const LINE_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');

/**
 * 1. Webhookの処理 (doPost) - AI機能マルチ分岐対応版
 */
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return ContentService.createTextOutput("OK");

  try {
    const json = JSON.parse(e.postData.contents);

    json.events.forEach(event => {
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text.trim();
        const replyToken = event.replyToken;

        let replyMessageObj = null;

        // 【分岐1】「訳 」または「翻訳 」で始まる場合 ➔ AI翻訳モード
        if (userMessage.startsWith("訳 ") || userMessage.startsWith("翻訳 ") || userMessage.startsWith("訳\n") || userMessage.startsWith("翻訳\n")) {
          const query = userMessage.replace(/^(訳|翻訳)[\s \n]+/, "");
          
          // api_ai.gs の askTranslationTeacher を直接実行
          const aiReply = askTranslationTeacher(query);
          
          replyMessageObj = {
            type: "text",
            text: aiReply || "⚠️ AI翻訳の生成に失敗しました。少し時間をおいてお試しください。"
          };

        // 【分岐2】「問 」または「質問 」で始まる場合 ➔ AI教師質問モード
        } else if (userMessage.startsWith("問 ") || userMessage.startsWith("質問 ") || userMessage.startsWith("問\n") || userMessage.startsWith("質問\n")) {
          const query = userMessage.replace(/^(問|質問)[\s \n]+/, "");
          
          // api_ai.gs の askGrammarQuestion を直接実行
          const aiReply = askGrammarQuestion(query);
          
          replyMessageObj = {
            type: "text",
            text: aiReply || "⚠️ AI教師の回答生成に失敗しました。"
          };

        // 【分岐3】それ以外 ➔ 従来の単語帳検索モード (Flex Message)
        } else {
          const searchResults = searchVocabularyForLine(userMessage);
          replyMessageObj = buildFlexMessage(searchResults, userMessage);
        }

        // Reply APIでLINEへ返信
        if (replyMessageObj) {
          sendLineReply(replyToken, replyMessageObj);
        }
      }
    });
  } catch (error) {
    console.error("LINE Webhook Error:", error);
  }

  return ContentService.createTextOutput(JSON.stringify({ content: "ok" })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * LINE Reply APIへPOSTリクエストを送信する共通関数
 */
function sendLineReply(replyToken, messageObj) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  
  const payload = {
    replyToken: replyToken,
    messages: [messageObj]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}
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