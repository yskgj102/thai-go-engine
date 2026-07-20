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

// 🌟 【隠しコマンド】自分のユーザーIDを取得する
        if (userMessage === "ID教えて") {
          replyMessageObj = {
            type: "text",
            text: `あなたのユーザーIDは以下です👇\n\n${event.source.userId}\n\nこれをGASのスクリプトプロパティ「MY_USER_ID」に登録してください。`
          };
          sendLineReply(replyToken, replyMessageObj);
          return; // ここで処理を終了
        }
// 【分岐1】「訳 」または「翻訳 」で始まる場合 ➔ AI翻訳モード
        if (userMessage.startsWith("訳 ") || userMessage.startsWith("翻訳 ") || userMessage.startsWith("訳\n") || userMessage.startsWith("翻訳\n")) {
          const query = userMessage.replace(/^(訳|翻訳)[\s \n]+/, "");
          const aiReply = askTranslationTeacher(query);
          
          replyMessageObj = {
            type: "text",
            // 🌟 修正: AIの返答を formatMarkdownForLine に通す
            text: formatMarkdownForLine(aiReply) || "⚠️ AI翻訳の生成に失敗しました。少し時間をおいてお試しください。"
          };

        // 【分岐2】「問 」または「質問 」で始まる場合 ➔ AI教師質問モード
        } else if (userMessage.startsWith("問 ") || userMessage.startsWith("質問 ") || userMessage.startsWith("問\n") || userMessage.startsWith("質問\n")) {
          const query = userMessage.replace(/^(問|質問)[\s \n]+/, "");
          const aiReply = askGrammarQuestion(query);
          
          replyMessageObj = {
            type: "text",
            // 🌟 修正: AIの返答を formatMarkdownForLine に通す
            text: formatMarkdownForLine(aiReply) || "⚠️ AI教師の回答生成に失敗しました。"
          };

// 【分岐3】それ以外 ➔ コピー可能なテキスト辞書モード
        } else {
          const searchResults = searchVocabularyForLine(userMessage);
          // Flex Messageではなく、テキスト生成関数を呼び出す
          replyMessageObj = buildTextDictionaryMessage(searchResults, userMessage);
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
 * LINE Reply APIへPOSTリクエストを送信する共通関数（デバッグ＆安全強化版）
 */
function sendLineReply(replyToken, messageObj) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  
  // 🌟 修正: 4980文字 + 15文字 = 4995文字 (確実に5000文字以内に収める)
  if (messageObj.type === 'text' && messageObj.text.length > 5000) {
    messageObj.text = messageObj.text.substring(0, 4980) + "\n\n...（文字数上限）";
  }

  const payload = {
    replyToken: replyToken,
    messages: [messageObj]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + (LINE_ACCESS_TOKEN ? LINE_ACCESS_TOKEN.trim() : "")
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  
  // 🌟 万が一エラーが起きた場合は、ログに詳細を刻む
  if (response.getResponseCode() !== 200) {
    console.error(`🚨 LINE API Error: [${response.getResponseCode()}] ${response.getContentText()}`);
  }
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
    // 🌟 修正: 正規表現のミスを修正（|で区切る場合は[]ではなく()）
    .replace(/(する|した|したこと)$/, "")
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

  // 🌟 修正: スコア順にソートし、テキスト表示に最適な上位「5件」を返す
  const hits = scoredData.filter(v => v.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore);
  return hits.slice(0, 5);
}

/**
 * スクロール不要！ 1件目ゆったり表示 ＋ 日本語付きクイックリプライ版
 */
function buildTextDictionaryMessage(results, keyword) {
  if (!results || results.length === 0) {
    return {
      type: "text",
      text: `「${keyword}」は見つかりませんでした😢\n\n💡AIに翻訳や解説を頼みますか？\n以下のボタンをタップして送信してみてください。\n\n訳 ${keyword}\n\n問 ${keyword}について教えて`
    };
  }

  const topItem = results[0];
  
  // 🌟 1. 1件目の表示を「改行・区切り線あり」の読みやすいレイアウトに戻す
  let mainBlock = `🟩 【 ${topItem.word_th || "不明"} 】\n`;
  mainBlock += `🗣️ ${topItem.phonetic || "---"}\n`;
  mainBlock += `🇯🇵 ${topItem.meaning_ja || "意味未登録"}\n`;
  
  // 例文
  if (topItem.example_th || topItem.example_ja) {
    mainBlock += `┈┈┈┈┈┈┈┈┈┈┈┈\n`;
    if (topItem.example_th) mainBlock += `🇹🇭 ${topItem.example_th}\n`;
    if (topItem.example_phonetic && topItem.example_phonetic !== "---") mainBlock += `🗣️ ${topItem.example_phonetic}\n`;
    if (topItem.example_ja) mainBlock += `💬 ${topItem.example_ja}\n`;
  }
  
  // 解説
  if (topItem.explanation) {
    mainBlock += `┈┈┈┈┈┈┈┈┈┈┈┈\n`;
    mainBlock += `📝 解説:\n${topItem.explanation}\n`;
  }

  // 🌟 2. 他の候補＆クイックリプライ（日本語対応版をキープ）
  let othersBlock = "";
  let quickReplyItems = [];

  if (results.length > 1) {
    othersBlock += `\n━━━━━━━━━━━━\n🔍 他の候補:\n`;
    for (let i = 1; i < results.length; i++) {
      const item = results[i];
      othersBlock += `・${item.word_th} (${item.meaning_ja})\n`;
      
      // ボタンの文字テキスト（タイ語＋日本語）を作成
      const btnLabel = `${item.word_th} (${item.meaning_ja})`;
      // LINEの仕様(ラベルは最大20文字)に引っかからないよう安全にカット
      const safeLabel = btnLabel.length > 20 ? btnLabel.substring(0, 18) + ".." : btnLabel;
      
      quickReplyItems.push({
        type: "action",
        action: {
          type: "message",
          label: safeLabel,
          text: item.word_th // タップ時はタイ語のみを送信して再検索させる
        }
      });
    }
  }

  const replyObj = {
    type: "text",
    text: (mainBlock + othersBlock).trimEnd()
  };

  if (quickReplyItems.length > 0) {
    replyObj.quickReply = {
      items: quickReplyItems
    };
  }

  return replyObj;
}

/**
 * AIからのMarkdownテキストをLINEで見やすいテキストレイアウトに変換する
 */
function formatMarkdownForLine(text) {
  if (!text) return "";

  return text
    // 1. 見出しの変換
    .replace(/^###\s+(.+)$/gm, "\n🟩 【 $1 】") // ### 見出し
    .replace(/^##\s+(.+)$/gm, "\n━━━ $1 ━━━") // ## 見出し
    .replace(/^#\s+(.+)$/gm, "👑 $1") // # 見出し

    // 2. 太字の変換（**太字** -> 「太字」）
    .replace(/\*\*(.*?)\*\*/g, "「$1」")
    .replace(/\*(.*?)\*/g, "「$1」")

    // 3. Markdownの表（テーブル）をテキストリストに変換
    // 区切り線（|---|---|）の行を削除
    .replace(/^\|[-:\s]+\|.*$/gm, "")
    // テーブルのヘッダー行（| タイ語 | 発音記号 | 日本語 |）を削除
    .replace(/^\|\s*タイ語\s*\|\s*発音記号\s*\|\s*日本語\s*\|$/gm, "")
    // データ行（| ไป | pai | 行く |）を絵文字付きのカード風テキストに変換
    .replace(/^\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/gm, (match, th, ph, ja) => {
       if (!th || !ph || !ja) return "";
       return `┈┈┈┈┈┈┈┈┈┈┈┈\n🇹🇭 ${th}\n🗣️ ${ph}\n🇯🇵 ${ja}`;
    })

    // 4. 連続する改行を綺麗に整える（最大2行まで）
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


/**
 * 毎朝実行する：特化型プッシュ通知クイズ
 */
function sendDailyQuiz() {
  const LINE_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');
  const MY_USER_ID = PropertiesService.getScriptProperties().getProperty('MY_USER_ID');
  
  if (!MY_USER_ID) {
    console.error("MY_USER_IDが設定されていません");
    return;
  }

  // 💡 ここにイレギュラーな単語群を定義（将来的にスプレッドシートから取得してもOK）
  const quizData = [
    {
      word: "สามารถ",
      question: "この単語の正しい発音はどれ？",
      correct: "sa-maat",
      wrong: "sa-ma-rot",
      note: "※黙字（ร）のトラップ。sa-ma-rotとは読みません。"
    },
    {
      word: "พรหม",
      question: "この単語（意味: カーペット/梵天）の正しい発音はどれ？",
      correct: "phrom",
      wrong: "phro-hom",
      note: "※ห は発音しない黙字マーカーとして機能します。"
    },
    {
      word: "อยาก",
      question: "この単語の正しい発音と声調ルールは？",
      correct: "yaak (低声)",
      wrong: "yaak (降声)",
      note: "※「อ」が中子音として機能し、後ろの低子音「ย」のトーンを支配します。"
    }
  ];

  // ランダムに1問選ぶ
  const quiz = quizData[Math.floor(Math.random() * quizData.length)];
  
  // 選択肢のボタン（クイックリプライ）を作成
  // ※どっちをタップしてもLINEの画面に文字として送信されるので、後で正誤判定も作れます
  const quickReplyItems = [
    { type: "action", action: { type: "message", label: quiz.correct, text: `正解: ${quiz.correct}` } },
    { type: "action", action: { type: "message", label: quiz.wrong, text: `回答: ${quiz.wrong}` } }
  ];
  
  // 選択肢をシャッフル（正解がいつも左にこないようにする）
  quickReplyItems.sort(() => Math.random() - 0.5);

  const payload = {
    to: MY_USER_ID,
    messages: [{
      type: "text",
      text: `🔔 本日のタイ語クイズ\n\n【 ${quiz.word} 】\n\n${quiz.question}`,
      quickReply: { items: quickReplyItems }
    }]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN.trim() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', options);
}