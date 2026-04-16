/**
 * ファイル名: api_ai.gs
 */

/**
 * メインのAI生成ロジック：安全装置付き
 */
function generateThaiDetails(word, keyIndex = 1) {
if (!word) return null;

  const TOTAL_KEYS = 8; 
  const MAX_RETRY_LIMIT = TOTAL_KEYS; 

  // --- 【負荷分散】時刻をベースに開始地点をずらす ---
  // 1秒単位のタイムスタンプを使用。リトライは数ミリ秒で走るため、1回のリクエスト中は offset が固定されます。
  const offset = Math.floor(new Date().getTime() / 1000) % TOTAL_KEYS;
  const currentKey = ((keyIndex - 1 + offset) % TOTAL_KEYS) + 1;
  const propName = `GEMINI_API_KEY_${currentKey}`;

  // 1. 【安全装置】全キーを試し終わったら終了
  if (keyIndex > MAX_RETRY_LIMIT) {
    console.error(`🛑 全 ${MAX_RETRY_LIMIT} 個のキーを試行しましたが全滅しました。`);
    return null;
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty(propName);
  
  // 2. 【改善】キーが未設定なら、止まらずに「次のキー」へ再帰呼び出し
  if (!apiKey) {
    console.warn(`⚠️ ${propName} が未設定のため、スキップして次を試します。`);
    return generateThaiDetails(word, keyIndex + 1); 
  }

  // URL、プロンプト、Payload、Optionsは山岡さんの「正解」を1ミリも変えず継承
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

const prompt = `
    あなたはタイ語教育の最高権威です。単語「${word}」について、言語学的な視点と実戦的なコミュニケーションの両面から、完璧な解析を行ってください。
    
    ## 依頼内容
    単語「${word}」について、以下の制約を守って解析してください。
    例文(example_th)は、以下の3つのシーンから、単語の性質に最も合うものを一つ選んで作成してください。言語学習に利用するので、日常でも実践できる簡潔な文とし、専門用語はなるべく使わず、長すぎないようにしてください。以下はシーンの優先順です。
    1. 【日常会話】: 日常で使う必須フレーズ。普段の生活で頻出のやりとり。使用頻度が最も多い使い方を示してください。
    2. 【旅行/文化】: タイや日本の文化や歴史、現地の人々との深い精神的交流、旅でのフレーズ。
    
    ## 出力制約
    - JSONオブジェクトのみを返してください。装飾や前置きは一切不要です。

    ## 発音表記（phonetic / example_phonetic）の厳守ルール
    - 音節ごとに必ず「-（ハイフン）」で繋いでください。
    - 各音節の母音の上に、5つの声調記号（á, à, â, ǎ, a）を必ず付与してください。
    - 【重要】特殊母音記号「ɛ, ɔ, ɯ」は積極的に使用してください。
    - アルファベット（ae, oo, uue）による代用ではなく、これら特殊記号の上に声調記号を乗せた表記を徹底してください。
    - 表記例 : thɔ́ɔng-fáa, sà-wàt-dii, khɔ̀ɔp-khun, phûut, mɯɯ, kɛ̂ɛo, khəəi

    ## 項目別ルール
    - category: 品詞を次から一つ選べ。動詞, 名詞, 形容詞, 副詞, 接続詞, 前置詞, 助動詞, 代名詞, 文末詞。名詞の場合は類別詞も含めること
    - explanation: セクションごとに「改行2回（\\n\\n）」、項目内は「改行1回（\\n）」を使用。Markdown装飾（**等）は使用せず、記号（■、・、1.）で視認性を確保。

    ## explanationの構成（全7項目を網羅してください）
    1. ■【語源と構成】: 単語の成り立ち。複成語の場合は各要素の意味を分解して解説。
    2. ■【核となるニュアンス】: 辞書的な意味を超えた、タイ人がその言葉を聞いた時に抱くイメージ。書き言葉（公式）か話し言葉（俗語）かの明示。
    3. ■【実戦的使い分け】: 日本人が混同しやすい類似表現との決定的な違い。使用すべきではない文脈や、丁寧度のグラデーション（丁寧/普通/粗野）。
    4. ■【類義語・反対語】: 
       類義語: タイ単語 (発音): 意味
       反対語: タイ単語 (発音): 意味
    5. ■【重要チャンク・成句】: 「${word}」を核とした、そのまま暗記すべき頻出フレーズを3つ以上。
    6. ■【例文の全単語解析】: 例文(example_th)を構成する全てのパーツについて、 タイ単語（発音）: 意味 の形式でリスト化。
    7. ■【読み方や見た目が似た語】:日本人が混同しやすい単語を挙げてください。
       タイ単語 (発音): 意味
    ## JSON Structure
    {
      "phonetic": "発音記号",
      "meaning_ja": "日本語の意味",
      "meaning_kana": "日本語の意味の読み（ひらがな）",
      "category": "品詞",
      "example_th": "例文",
      "example_phonetic": "例文の発音記号",
      "example_ja": "例文の日本語訳",
      "explanation": "■【語源と構成】\\n（記述）\\n\\n■【核となるニュアンス】\\n（記述）\\n\\n■【実戦的使い分け】\\n（記述）\\n\\n■【類義語・反対語】\\n（記述）\\n\\n■【重要チャンク・成句】\\n（記述）\\n\\n■【例文の全単語解析】\\n（記述）■【読み方や見た目が似た語】\\n（記述）"
    }
  `;


  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const options = {
    method: 'POST',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const resText = response.getContentText();

    if (code !== 200) {
      console.warn(`🚨 Key_${keyIndex} (${propName}) エラー (Status: ${code})。次へ...`);
      // エラーの詳細ログも落とさない
      console.log(`Response: ${resText}`);
      
      // 次のキーへ（keyIndexをカウントアップして再帰呼び出し）
      return generateThaiDetails(word, keyIndex + 1);
    }

    const data = JSON.parse(resText);
    let resultText = data['candidates'][0]['content']['parts'][0]['text'];

    // Markdownクリーニング処理（継承）
    resultText = resultText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    console.log(`✨ Key_${keyIndex} で成功！`);
    return JSON.parse(resultText);

  } catch (e) {
    console.error(`💥 Key_${keyIndex} 例外発生: ${e.message}`);
    // 通信エラーでも止まらず次を試す
    return generateThaiDetails(word, keyIndex + 1);
  }
}

/**
 * クイック追加：JS側の「型」と「階層」に100%適合させる最終形
 */
function quickAddAutoFill(inputText) {
  if (!inputText) return { status: "error" };

  const isThai = /[\u0E00-\u0E7F]/.test(inputText);
  let word_th, meaning_ja;

if (isThai) {
    // タイ語入力 -> 日本語を補完
    word_th = inputText.trim();
    meaning_ja = LanguageApp.translate(word_th, 'th', 'ja');
  } else {
    // 日本語入力 -> タイ語を補完
    meaning_ja = inputText.trim();
    // Google翻訳の Ja->Th は余計な空白が入ることがあるため除去
    word_th = LanguageApp.translate(meaning_ja, 'ja', 'th').replace(/\s+/g, '');
  }

  // 1. 重複チェック
  if (existsInVocabulary(word_th)) {
    const all = getRawVocabulary();
    const duplicate = all.find(v => v.word_th === word_th);
    return { status: "duplicate", word: word_th, data: duplicate };
  }

  // 2. AI詳細生成（テスト用 null）
  const ai = null;

  // 3. ヘッダー解析
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('m_vocabulary');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // 4. マッピング
  const timestamp = Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
  const now = new Date();
  
const dataMap = {
    "id": "word_" + timestamp,
    "word_th": word_th,
    "phonetic": "---", // 翻訳エンジンでは発音記号が取れないため
    "meaning_ja": meaning_ja,
    "meaning_kana": "---",
    "category": "---",
    "example_th": "---",
    "example_phonetic": "---",
    "example_ja": "---",
    "explanation": "クイック追加（翻訳）により詳細未生成。再生成ボタンを押してください。",
    "last_update": now,
    "is_bookmark": false
  };

  const newRow = headers.map(header => {
    return dataMap[header] !== undefined ? dataMap[header] : "";
  });

  sheet.appendRow(newRow);

  // 5. 【物理的解決】JS側が Date型で爆発しないよう、文字列にしてから包んで返す
  return { 
    status: "success", 
    word: word_th,
    data: {
      ...dataMap,
      "last_update": Utilities.formatDate(now, "JST", "yyyy-MM-dd HH:mm:ss"),
      interval: 0,
      last_date: "New"
    }
  };
}

/**
 * スプレッドシート更新ロジック（情報を落とさず継承）
 */
function reGenerateCardById(targetId) {
  if (!targetId) return null;

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('m_vocabulary');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const idColIndex = headers.indexOf("id");
    const wordThColIndex = headers.indexOf("word_th");
    let rowIndex = -1;
    let wordToProcess = "";

    for (let i = 1; i < data.length; i++) {
      if (data[i][idColIndex] === targetId) {
        rowIndex = i + 1;
        wordToProcess = data[i][wordThColIndex];
        break;
      }
    }

    if (rowIndex === -1 || !wordToProcess) return null;

    const ai = generateThaiDetails(wordToProcess);
    if (!ai) return null;

    const dataMap = {
      "id": targetId,
      "word_th": wordToProcess,
      "phonetic": ai.phonetic,
      "meaning_ja": ai.meaning_ja,
      "meaning_kana": ai.meaning_kana,
      "category": ai.category,
      "example_th": ai.example_th,
      "example_phonetic": ai.example_phonetic,
      "example_ja": ai.example_ja,
      "explanation": ai.explanation,
      "last_update": new Date()
    };

    const updatedRow = headers.map((header, index) => {
      return dataMap[header] !== undefined ? dataMap[header] : data[rowIndex - 1][index];
    });

    sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
    return ai;

  } catch (e) {
    console.error("Sheet Update Error: " + e.message);
    return null;
  }
}

/**
 * 特定の単語をマスタおよび学習ログから完全に削除する
 * @param {string} vocabId - 削除対象の単語ID
 */
function deleteWordAndLogs(vocabId) {
  if (!vocabId) return { status: "error", message: "ID is required" };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const vocabSheet = ss.getSheetByName('m_vocabulary');
  const logSheet = ss.getSheetByName('t_learning_logs');

  // 1. マスタから削除
  const vocabData = vocabSheet.getDataRange().getValues();
  const vIdIdx = vocabData[0].indexOf("id");
  let foundRow = -1;

  for (let i = 1; i < vocabData.length; i++) {
    if (vocabData[i][vIdIdx] === vocabId) {
      foundRow = i + 1; // 行番号は1始まり
      break;
    }
  }

  if (foundRow === -1) return { status: "error", message: "Word not found" };

  // 2. 学習ログから紐づく行を全削除（高速化のため抽出して書き戻し）
  const logData = logSheet.getDataRange().getValues();
  const logHeaders = logData[0];
  const logIdIdx = logHeaders.indexOf("vocab_id");
  
  const cleanLogs = logData.filter((row, idx) => {
    return idx === 0 || row[logIdIdx] !== vocabId;
  });

  // 反映
  vocabSheet.deleteRow(foundRow);
  logSheet.clearContents();
  logSheet.getRange(1, 1, cleanLogs.length, logHeaders.length).setValues(cleanLogs);

  return { status: "success", deletedLogs: logData.length - cleanLogs.length };
}

/**
 * ブックマークの状態を反転させる
 */
function toggleBookmark(targetId) {
  if (!targetId) return { status: "error" };

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('m_vocabulary');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const idIdx = headers.indexOf("id");
    const bmIdx = headers.indexOf("is_bookmark");
    
    if (idIdx === -1 || bmIdx === -1) return { status: "error", message: "Column not found" };

    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx] === targetId) {
        // 現在の値を反転（真偽値として扱う）
        const currentState = data[i][bmIdx];
        const newState = !currentState;
        
        sheet.getRange(i + 1, bmIdx + 1).setValue(newState);
        
        return { status: "success", is_bookmark: newState };
      }
    }
    return { status: "error", message: "ID not found" };
  } catch (e) {
    return { status: "error", message: e.message };
  }
}

// api_ai.gs に追記するだけ
function getQuickTranslation(text) {
  if (!text) return "";
  // 日本語ならタイ語へ、タイ語なら日本語へ自動判別して翻訳
  const target = /[\u0E00-\u0E7F]/.test(text) ? 'ja' : 'th';
  const source = target === 'ja' ? 'th' : 'ja';
  return LanguageApp.translate(text, source, target);
}
