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
      // 🌟 【ここに追加】どの処理に飛んでも共通で使えるように、最初に replyToken を取り出しておく
      const replyToken = event.replyToken;
      // 🌟 クイズの解答（Postback）を受け取った時の処理
  if (event.type === 'postback') {
    const data = event.postback.data;
    
    if (data.startsWith('action=quiz')) {
      let res = "", word = "", vocabId = "";
      
      // 隠しデータから情報を取り出す
      data.split('&').forEach(part => {
        if (part.startsWith('res=')) res = part.split('=')[1];
        if (part.startsWith('word=')) word = decodeURIComponent(part.split('=')[1]);
        if (part.startsWith('id=')) vocabId = part.split('=')[1];
      });

      // キャッシュからAI生成の解説を引き出す
      const explanation = CacheService.getScriptCache().get(`quiz_${word}`) || "解説の有効期限が切れました。単語帳で詳細を確認してください。";

      const isCorrect = (res === "1");
      
      // ★ ここが要！解答結果を忘却曲線エンジンに流し込む
      // 正解ならスコア3(簡単)、不正解ならスコア1(難しい)として学習ログを保存
      if (vocabId) {
        const score = isCorrect ? 3 : 1;
        saveLearningLog(vocabId, score);
      }

      // 判定結果のメッセージを作成
      const header = isCorrect ? "⭕️ 大正解！素晴らしいです🎉" : "❌ 残念！惜しい...！";
      const replyText = `${header}\n\n🟩 【 ${word} 】\n📝 AI解説:\n${explanation}\n\n※この結果は学習記録に反映されました！`;

      // Botから返信
      sendLineReply(replyToken, { type: 'text', text: replyText });
      
      return ContentService.createTextOutput(JSON.stringify({'content': 'postback handled'})).setMimeType(ContentService.MimeType.JSON);
    }
  }
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
// 🌟 【分岐1】AI翻訳モード ("t " や "t\n" のように、直後に空白や改行がある場合のみ発動)
        if (/^(t|訳|翻訳)[\s \n]+/i.test(userMessage)) {
          const query = userMessage.replace(/^(t|訳|翻訳)[\s \n]+/i, "").trim();
          
          if (!query) {
            replyMessageObj = { type: "text", text: "⚠️ 翻訳したい文章を入力してください。\n（例: t 私はタイ語を勉強しています）" };
          } else {
            const aiReply = askTranslationTeacher(query);
            replyMessageObj = {
              type: "text",
              text: formatMarkdownForLine(aiReply) || "⚠️ AI翻訳の生成に失敗しました。"
            };
          }

        // 🌟 【分岐2】AI教師質問モード ("q " や "q\n" のように、直後に空白や改行がある場合のみ発動)
        } else if (/^(q|問|質問)[\s \n]+/i.test(userMessage)) {
          const query = userMessage.replace(/^(q|問|質問)[\s \n]+/i, "").trim();
          
          if (!query) {
            replyMessageObj = { type: "text", text: "⚠️ 先生に質問したい内容を入力してください。\n（例: q 文法について教えて）" };
          } else {
            const aiReply = askGrammarQuestion(query);
            replyMessageObj = {
              type: "text",
              text: formatMarkdownForLine(aiReply) || "⚠️ AI教師の回答生成に失敗しました。"
            };
          }

        // 🌟 【分岐3】それ以外 ➔ 「t」で始まる単語も含め、すべて通常のテキスト辞書検索へ！
        } else {
          const searchResults = searchVocabularyForLine(userMessage);
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
 * 忘却曲線 × AI連動型：プッシュ通知クイズ
 */
function sendDailyQuiz() {
  const LINE_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');
  const MY_USER_ID = PropertiesService.getScriptProperties().getProperty('MY_USER_ID');
  
  if (!MY_USER_ID || !LINE_ACCESS_TOKEN) return;

  // 1. 忘却曲線エンジンを使って、今一番「復習すべき単語」を取得
  const reviewQueue = getSpacedRepetitionData();
  if (!reviewQueue || reviewQueue.length === 0) return;

  // キューの先頭（最も優先度が高い単語）を取得
  const targetItem = reviewQueue[0];
  const word_th = targetItem.word_th;
  const meaning_ja = targetItem.meaning_ja;

// 2. AIエンジンで、その単語の「弱点」を突くクイズを動的生成
  const prompt = `あなたは、タイ語学習者を優しく励まし、確実にステップアップさせてくれるプロのタイ語教師です。
  お題の単語「${word_th}」（意味: ${meaning_ja}）を使って、日本人が思わず引っかかりやすい「2択クイズ」を作成してください。

  【問題作成の条件】
  単語の性質に合わせて、発音問題ばかりに偏らないよう、以下の4つのテーマから最も適したものを1つ選んで出題してください。（※特に動詞や形容詞の場合は3や4を優先すること）
  1. 不規則なスペルや発音（黙字、特殊な母音変化など）
  2. 声調（トーン）の落とし穴
  3. 似た単語や類義語とのニュアンスの使い分け（直訳の罠など）
  4. 実際の会話での自然な言い回し・法助動詞の構文

  【発音記号の厳守ルール（※テーマ1, 2の音声系クイズを選んだ場合）】
  発音や声調に関するクイズの場合、選択肢や解説には必ず以下のルールで「発音記号」を併記してください。
  - 音節ごとに「-（ハイフン）」で繋ぐこと。
  - 母音の上に5つの声調記号（á, à, â, ǎ, a ※平声は記号なし）を必ず付与すること。
  - 特殊母音記号（ɛ, ɔ, ɯ）を積極的に使用すること。
  - 表記例 : khɔ̀ɔp-khun, phûut, mɯɯ

  【解説（explanation）の条件】
  ・単なる正解の提示ではなく、「なぜ日本人がこの間違いをしやすいのか」に寄り添って親切に解説してください。
  ・「素晴らしいですね！」「この調子でいきましょう！」など、学習者のモチベーションを上げる温かい声かけを必ず文末に入れてください。
  ・LINEの画面で読みやすいよう、適宜「\\n」を使って改行を入れてください。

  【出力形式】（以下のJSON形式のみを出力し、マークダウンの装飾などは含めないこと）
  {
    "question": "問題文 (例: 会話で「〜」と言いたい時、より自然な表現はどちら？)",
    "correct": "正解の選択肢 (タイ語と、必要なら発音記号や日本語を20文字以内で)",
    "wrong": "不正解の選択肢 (タイ語と、必要なら発音記号や日本語を20文字以内で)",
    "explanation": "解説文。（必ず\\nで改行を含めること）"
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

  // 3. AIの解説文をキャッシュに一時保存（Postbackの300文字制限を回避）
  CacheService.getScriptCache().put(`quiz_${word_th}`, quiz.explanation, 60 * 60 * 24); // 24時間保持

  // 4. Postbackアクションを使った選択肢の生成
  const quickReplyItems = [
    {
      type: "action",
      action: {
        type: "postback",
        label: quiz.correct.substring(0, 20),
        // res=1(正解), word=対象単語, id=学習ログ記録用の単語ID
        data: `action=quiz&res=1&word=${encodeURIComponent(word_th)}&id=${targetItem.id}`,
        displayText: quiz.correct
      }
    },
    {
      type: "action",
      action: {
        type: "postback",
        label: quiz.wrong.substring(0, 20),
        data: `action=quiz&res=0&word=${encodeURIComponent(word_th)}&id=${targetItem.id}`,
        displayText: quiz.wrong
      }
    }
  ];
  
  // 選択肢をシャッフル（正解が必ず左にならないように）
  quickReplyItems.sort(() => Math.random() - 0.5);

  const payload = {
    to: MY_USER_ID,
    messages: [{
      type: "text",
      text: `🧠 今日のAIタイ語クイズ\n\nお題：【 ${word_th} 】\n\n${quiz.question}`,
      quickReply: { items: quickReplyItems }
    }]
  };

  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN.trim() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}