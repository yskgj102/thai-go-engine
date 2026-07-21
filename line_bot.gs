/**
 * ファイル名: line_bot.gs
 * 役割: LINE Messaging APIとの通信、およびFlex MessageのUI生成
 */

// LINE Developersで取得したチャネルアクセストークンをスクリプトプロパティに設定してください
const LINE_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');
/**
 * 1. Webhookの処理 (doPost) - 完全修復版
 */
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return ContentService.createTextOutput("OK");

  try {
    const json = JSON.parse(e.postData.contents);

    json.events.forEach(event => {
      const replyToken = event.replyToken;

      // 🌟 1. ボタンタップ時（Postbackイベント）の処理
      if (event.type === 'postback') {
        const data = event.postback.data;

        // 🇹🇭 自分の「タイ語クイズ」の解答処理
        if (data.startsWith('action=quiz')) {
          let res = "", word = "", vocabId = "";
          
          data.split('&').forEach(part => {
            if (part.startsWith('res=')) res = part.split('=')[1];
            if (part.startsWith('word=')) word = decodeURIComponent(part.split('=')[1]);
            if (part.startsWith('id=')) vocabId = part.split('=')[1];
          });

          const propKey = `quiz_${vocabId}`;
          const props = PropertiesService.getScriptProperties();
          const explanation = props.getProperty(propKey);

          if (!explanation) {
            sendLineReply(replyToken, { 
              type: 'text', 
              text: '⚠️ このクイズは既に解答済みです！（もしくは期限切れ）\n単語帳で詳細を確認してください。' 
            });
            return;
          }

          props.deleteProperty(propKey);
          const isCorrect = (res === "1");
          
          if (vocabId && vocabId !== "undefined") {
            saveLearningLog(vocabId, isCorrect ? 3 : 1);
          }

          const header = isCorrect ? "⭕️ 大正解！素晴らしいです🎉" : "❌ 残念！惜しい...！";
          const replyText = `${header}\n\n🟩 【 ${word} 】\n📝 AI解説:\n${explanation}\n\n※この結果は学習記録に反映されました！`;
          sendLineReply(replyToken, { type: 'text', text: replyText });
          return;
        }

        // 🇯🇵 友人向け「日本語クイズ」の解答処理
        if (data.startsWith('action=ja_quiz')) {
          let res = "", word = "";
          
          data.split('&').forEach(part => {
            if (part.startsWith('res=')) res = part.split('=')[1];
            if (part.startsWith('word=')) word = decodeURIComponent(part.split('=')[1]);
          });

          const propKey = `ja_quiz_${encodeURIComponent(word)}`;
          const props = PropertiesService.getScriptProperties();
          const explanation = props.getProperty(propKey);

          if (!explanation) {
            sendLineReply(replyToken, { 
              type: 'text', 
              text: '⚠️ ตอบคำถามนี้ไปแล้วครับ!\n(このクイズは既に解答済みです)' 
            });
            return;
          }

          props.deleteProperty(propKey);
          const isCorrect = (res === "1");
          const header = isCorrect ? "⭕️ ถูกต้องครับ! เก่งมาก🎉 (大正解！)" : "❌ น่าเสียดาย... (惜しい！)";
          const replyText = `${header}\n\n🟩 【 ${word} 】\n📝 คำอธิบาย (解説):\n${explanation}`;

          sendLineReply(replyToken, { type: 'text', text: replyText });
          return;
        }
      }

// 🌟 2. テキストメッセージ受信時の処理
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text.trim();
        let replyMessageObj = null;

        // 【隠しコマンド】自分のユーザーIDを取得
        if (userMessage === "ID教えて") {
          replyMessageObj = { type: "text", text: `あなたのユーザーID👇\n${event.source.userId}` };
          sendLineReply(replyToken, replyMessageObj);
          return;
        }

        // 🌟 【分岐1】AI翻訳モード (先頭が t でも、末尾が t でも両方発動！)
        if (/^(t|訳|翻訳)[\s \n]+/i.test(userMessage) || /[\s \n]+(t|訳|翻訳)$/i.test(userMessage)) {
          // どっちのパターンで入力されても、邪魔なコマンド文字を消す
          const query = userMessage.replace(/^(t|訳|翻訳)[\s \n]+/i, "").replace(/[\s \n]+(t|訳|翻訳)$/i, "").trim();
          
          if (!query) {
            replyMessageObj = { type: "text", text: "⚠️ 翻訳したい文章を入力してください。" };
          } else {
            try {
              const aiReply = askTranslationTeacher(query);
              replyMessageObj = { type: "text", text: formatMarkdownForLine(aiReply) || "⚠️ 翻訳の生成に失敗しました。" };
            } catch (err) {
              // 🚨 クラッシュした場合は既読スルーせず、原因をLINEに送信する
              replyMessageObj = { type: "text", text: `🚨 翻訳AIエラー発生:\n${err.message}` };
            }
          }

        // 🌟 【分岐2】AI教師質問モード (先頭が q でも、末尾が q でも両方発動！)
        } else if (/^(q|問|質問)[\s \n]+/i.test(userMessage) || /[\s \n]+(q|問|質問)$/i.test(userMessage)) {
          const query = userMessage.replace(/^(q|問|質問)[\s \n]+/i, "").replace(/[\s \n]+(q|問|質問)$/i, "").trim();
          
          if (!query) {
            replyMessageObj = { type: "text", text: "⚠️ 質問内容を入力してください。" };
          } else {
            try {
              const aiReply = askGrammarQuestion(query);
              replyMessageObj = { type: "text", text: formatMarkdownForLine(aiReply) || "⚠️ 回答の生成に失敗しました。" };
            } catch (err) {
              replyMessageObj = { type: "text", text: `🚨 質問AIエラー発生:\n${err.message}` };
            }
          }

        // 🌟 【分岐3】通常のテキスト辞書検索
        } else {
          try {
            const searchResults = searchVocabularyForLine(userMessage);
            replyMessageObj = buildTextDictionaryMessage(searchResults, userMessage);
          } catch (err) {
            replyMessageObj = { type: "text", text: `🚨 辞書検索エラー発生:\n${err.message}` };
          }
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
    .replace(/^\|[-:\s]+\|.*$/gm, "")
    .replace(/^\|\s*タイ語\s*\|\s*発音記号\s*\|\s*日本語\s*\|$/gm, "")
    .replace(/^\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/gm, (match, th, ph, ja) => {
       if (!th || !ph || !ja) return "";
       return `┈┈┈┈┈┈┈┈┈┈┈┈\n🇹🇭 ${th}\n🗣️ ${ph}\n🇯🇵 ${ja}`;
    })

    // 4. 連続する改行を綺麗に整える（最大2行まで）
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
 * 忘却曲線 × AI連動型：プッシュ通知クイズ (UI・お題・データ保持 完璧版)
 */
function sendDailyQuiz() {
  const LINE_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');
  const MY_USER_ID = PropertiesService.getScriptProperties().getProperty('MY_USER_ID');
  
  if (!MY_USER_ID || !LINE_ACCESS_TOKEN) return;

  const reviewQueue = getSpacedRepetitionData();
  if (!reviewQueue || reviewQueue.length === 0) return;

  const targetItem = reviewQueue[0];
  const word_th = targetItem.word_th;
  const meaning_ja = targetItem.meaning_ja;
  const vocabId = targetItem.id; // 🌟 安全なIDを使用
  
// 🌟 AIへの指示：お題を「日本語」にし、タイ語の答えを問題文から隠す（シャッフル対策＆3択固定版）
  const prompt = `あなたはプロのタイ語教師です。
  日本語の「${meaning_ja}」（タイ語の正解: ${word_th}）をテーマにして、日本人が最も引っかかりやすい「3択クイズ」を作成してください。

  【🚨重要・厳守ルール】
  1. 問題文やお題にはタイ語（${word_th}）を絶対に書かず、「${meaning_ja}と言いたい時の自然な表現はどれ？」といった形式にすること。
  2. 選択肢のテキスト（text）内に「(正解)」「〇」などのヒントは一切含めないこと。純粋な「タイ語と発音記号のみ」を出力してください。
  3. 不正解のダミーは、日本人学習者が間違えやすい声調違い、類義語、直訳の罠などにしてください。
  4. 【絶対厳守】選択肢（choices）は「必ず3つのみ（正解1つ、不正解2つ）」出力してください。絶対に4つ以上作らないでください。
  5. 🌟【解説の書き方・超重要】LINE上で選択肢をランダムにシャッフルするため、解説（explanation）の中で「選択肢1」「A」「B」「C」のような【順番や記号による言及】は絶対に禁止です。必ず「『〇〇（タイ語）』の場合は〜」のように、【具体的な選択肢のタイ語】をそのまま引用して解説してください。

  【出力形式】（以下のJSON形式のみを出力すること）
  {
    "question": "問題文 (例: 友達と「〜」と言いたい時、より自然な表現はどれ？)",
    "choices": [
      { "text": "タイ語 (発音記号)", "isCorrect": true },
      { "text": "タイ語 (発音記号)", "isCorrect": false },
      { "text": "タイ語 (発音記号)", "isCorrect": false }
    ],
    "explanation": "なぜ間違えやすいのか解説してください。（※A,Bなどの記号は使わず、単語そのものを引用すること）\\nで改行を入れ、最後に褒め言葉を入れてください。"
  }`;

  let aiResultText = callGeminiApi(prompt);
  if (!aiResultText) return;

  let quiz;
  try {
    quiz = JSON.parse(aiResultText.replace(/```json/g, "").replace(/```/g, "").trim());
  } catch(e) {
    console.error("クイズJSONパース失敗", e);
    return;
  }

  // 🌟 保存キーをタイ語ではなく「単語ID」に変更（文字化けによる削除失敗を防ぐ）
  PropertiesService.getScriptProperties().setProperty(`quiz_${vocabId}`, quiz.explanation);

  // 🌟 【安全装置】万が一AIが4つ以上の選択肢を出してきた場合、強制的に3つ（正解1＋不正解2）にカットする
  if (quiz.choices && quiz.choices.length > 3) {
    const correctChoice = quiz.choices.find(c => c.isCorrect) || quiz.choices[0];
    const wrongChoices = quiz.choices.filter(c => !c.isCorrect).slice(0, 2);
    quiz.choices = [correctChoice, ...wrongChoices];
  }

  // 選択肢をランダムにシャッフル
  quiz.choices.sort(() => Math.random() - 0.5);

  const choiceLabels = ["A", "B", "C"];
  
  // 🌟 Flex Message 本文（お題と、長い選択肢テキストをここに書く）
const bodyContents = [
    { type: "text", text: "🧠AIタイ語クイズ", weight: "bold", color: "#1DB446", size: "sm" },
    { type: "text", text: `お題：【 ${meaning_ja} 】`, weight: "bold", size: "md", margin: "md", wrap: true }, // 🌟 ここに「, wrap: true」を追加！
    { type: "text", text: quiz.question, wrap: true, margin: "md", size: "sm", color: "#333333" },
    { type: "separator", margin: "md" }
  ];

  const buttons = [];

  quiz.choices.forEach((choice, index) => {
    const label = choiceLabels[index];
    
    // 本文に選択肢を追加 (文字数制限なしでゆったり表示)
    bodyContents.push({
      type: "text",
      text: `${label} : ${choice.text}`,
      wrap: true,
      size: "sm",
      margin: "md",
      weight: "bold"
    });

    // 🌟 ボタン側はシンプルに「Aを選ぶ」等にする（20文字制限を完全回避）
    const resVal = choice.isCorrect ? 1 : 0;
    buttons.push({
      type: "button",
      style: "secondary",
      margin: "sm",
      action: {
        type: "postback",
        label: `${label}`,
        data: `action=quiz&res=${resVal}&id=${vocabId}&word=${encodeURIComponent(word_th)}`,
        displayText: `${label} を選択しました`
      }
    });
  });

  const flexMessage = {
    type: "flex",
    altText: `AIタイ語クイズ: ${meaning_ja}`,
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", contents: bodyContents },
      footer: { type: "box", layout: "horizontal", spacing: "sm", contents: buttons } // 横並びボタン
    }
  };

  const payload = {
    to: MY_USER_ID,
    messages: [flexMessage]
  };

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN.trim() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

/**
 * 🇹🇭 タイ人の友人向け：日本語クイズ自動配信（忘却曲線なし / レベル2〜4 / ログなし）
 */
function sendJapaneseQuizToFriend() {
  const LINE_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');
  // 🌟 指定された友人のLINEユーザーID
  // const FRIEND_USER_ID = "U6aa745d2e458755714ac5d158cad624d";//me
  const FRIEND_USER_ID = "U229c57ca5f6954a61d20837fba0a53a3";//อิโยะ
  
  if (!LINE_ACCESS_TOKEN) return;

  // 1. 辞書データから全件取得
  const allData = getRawVocabulary();
  if (!allData || allData.length === 0) return;

  // 🌟 レベル2, 3, 4 の単語だけに絞り込む（もしlevel列がなければ全体から選ぶ安全設計）
  let targetList = allData.filter(item => {
    const lvl = parseInt(item.level, 10);
    return lvl >= 2 && lvl <= 4;
  });
  if (targetList.length === 0) targetList = allData;

  // ランダムに1件ピックアップ（忘却曲線は無視）
  const randomIndex = Math.floor(Math.random() * targetList.length);
  const targetItem = targetList[randomIndex];
  
  const word_th = targetItem.word_th;
  const meaning_ja = targetItem.meaning_ja;
// 2. AIへ「タイ人向けの日本語クイズ」を作成するよう指示（難易度MAX・シャッフル対策版）
  const prompt = `あなたはプロの日本語教師です。タイ人の中級〜上級の学習者に向けて、手応えのある「JLPT N3〜N2レベル」の日本語クイズを作成してください。
  お題となる単語のタイ語は「${word_th}」、日本語の意味は「${meaning_ja}」です。

  【🚨重要・厳守ルール】
  1. 問題文（question）はタイ語を使わず、「すべて日本語」で作成してください。（例：「タイ語の『${word_th}』と同じ意味になるように、（  ）に最も良い言葉を入れてください。」のような穴埋め形式など）
  2. 問題文にはふりがなを一切振らないでください。通常の日本語で記述してください。
  3. 選択肢（text）の日本語に難しい漢字が含まれる場合のみ、「漢字（ふりがな）」の形式でふりがなを振ってください。
  4. 選択肢内に「(正解)」などのヒントは一切含めないこと。
  5. タイ人が非常に間違いやすい「助詞（に・で・を・が）の罠」「自動詞・他動詞の引っかけ」「類義語（似ている言葉）の使い分け」などの巧妙なダミーを用意してください。
  6. クイズの解説（explanation）は、タイ人がしっかり理解できるように「自然なタイ語」で記述してください。
  7. 【絶対厳守】選択肢（choices）は「必ず3つのみ（正解1つ、不正解2つ）」出力してください。絶対に4つ以上作らないでください。
  8. 🌟【解説の書き方・超重要】LINE上で選択肢をランダムにシャッフルするため、解説（explanation）の中で「選択肢1」「A」「B」「C」のような【順番や記号による言及】は絶対に禁止です。必ず「『預（あず）ける』の場合は〜」のように、【具体的な選択肢のテキスト】をそのまま引用して解説してください。

  【出力形式】（以下のJSON形式のみを出力すること）
  {
    "question": "日本語の問題文",
    "choices": [
      { "text": "選択肢の日本語（難読漢字のみふりがな）", "isCorrect": true },
      { "text": "選択肢の日本語（難読漢字のみふりがな）", "isCorrect": false },
      { "text": "選択肢の日本語（難読漢字のみふりがな）", "isCorrect": false }
    ],
    "explanation": "なぜその正解になるのか、タイ人が間違えやすいポイントを詳しい『タイ語』で解説してください。（※A,Bなどの記号は使わず、言葉そのものを引用すること）\\nで改行を含めること。"
  }`;

  let aiResultText = callGeminiApi(prompt);
  if (!aiResultText) return;

  let quiz;
  try {
    quiz = JSON.parse(aiResultText.replace(/```json/g, "").replace(/```/g, "").trim());
  } catch(e) {
    console.error("日本語クイズJSONパース失敗", e);
    return;
  }

  // 3. 自分のタイ語クイズと競合しないよう、「ja_quiz_」というキーで解説を保存
  const propKey = `ja_quiz_${encodeURIComponent(word_th)}`;
  PropertiesService.getScriptProperties().setProperty(propKey, quiz.explanation);

  // 🌟 【安全装置】万が一AIが4つ以上の選択肢を出してきた場合、強制的に3つ（正解1＋不正解2）にカットする
  if (quiz.choices && quiz.choices.length > 3) {
    const correctChoice = quiz.choices.find(c => c.isCorrect) || quiz.choices[0]; // 正解を確保
    const wrongChoices = quiz.choices.filter(c => !c.isCorrect).slice(0, 2); // ダミーを2つに絞る
    quiz.choices = [correctChoice, ...wrongChoices]; // 3つに再構築
  }

  // 選択肢をシャッフル
  quiz.choices.sort(() => Math.random() - 0.5);

  const choiceLabels = ["A", "B", "C"];
  
  // 🌟 見分けがつくように、ヘッダーを「青色（#1D4ED8）」に変更
  const bodyContents = [
    { type: "text", text: "🇯🇵日本語クイズ", weight: "bold", color: "#1D4ED8", size: "sm" },
    { type: "text", text: `โจทย์：【 ${word_th} 】`, weight: "bold", size: "md", margin: "md" },
    { type: "text", text: quiz.question, wrap: true, margin: "md", size: "sm", color: "#333333" },
    { type: "separator", margin: "md" }
  ];

  const buttons = [];

  quiz.choices.forEach((choice, index) => {
    const label = choiceLabels[index];
    
    bodyContents.push({
      type: "text", text: `${label} : ${choice.text}`, wrap: true, size: "sm", margin: "md", weight: "bold"
    });

    const resVal = choice.isCorrect ? 1 : 0;
    
    // 🌟 action=ja_quiz に設定（自分のクイズと処理を分離）
    buttons.push({
      type: "button",
      style: "secondary",
      margin: "sm",
      action: {
        type: "postback",
        label: `${label}`,
        data: `action=ja_quiz&res=${resVal}&word=${encodeURIComponent(word_th)}`,
        displayText: `เลือก ${label}` // "Aを選びました"のタイ語
      }
    });
  });

  const flexMessage = {
    type: "flex",
    altText: `ควิซภาษาญี่ปุ่น: ${word_th}`,
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", contents: bodyContents },
      footer: { type: "box", layout: "horizontal", spacing: "sm", contents: buttons }
    }
  };

  const payload = {
    to: FRIEND_USER_ID,
    messages: [flexMessage]
  };

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN.trim() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}