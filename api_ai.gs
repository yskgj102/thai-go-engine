/**
 * ファイル名: api_ai.gs
 */


/**
 * 共通AI通信エンジン（完全分散ラウンドロビン＆連打ガード搭載）
 * @param {string} prompt - AIに投げる指示
 * @param {number} retryCount - リトライ回数（内部用）
 * @return {string|null} AIからの返答テキスト（失敗時はnull）
 */
function callGeminiApi(prompt, retryCount = 1) {
  const TOTAL_KEYS = 6; // 真の独立プロジェクト数

  if (retryCount > TOTAL_KEYS) {
    console.error(`🛑 全 ${TOTAL_KEYS} 個のキーが全滅しました。`);
    return null;
  }

  const props = PropertiesService.getScriptProperties();
  let currentKey = parseInt(props.getProperty('LAST_USED_KEY_INDEX')) || 0;
  currentKey = (currentKey % TOTAL_KEYS) + 1;
  props.setProperty('LAST_USED_KEY_INDEX', currentKey.toString());

  const propName = `GEMINI_API_KEY_${currentKey}`;
  const apiKey = props.getProperty(propName);
  
  if (!apiKey) {
    return callGeminiApi(prompt, retryCount + 1); 
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';
  const payload = { contents: [{ parts: [{ text: prompt }] }] };
  const options = {
    method: 'POST',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      Utilities.sleep(1500); // スパムガード
      return callGeminiApi(prompt, retryCount + 1);
    }
    const data = JSON.parse(response.getContentText());
    return data['candidates'][0]['content']['parts'][0]['text'];
  } catch (e) {
    Utilities.sleep(1500); // スパムガード
    return callGeminiApi(prompt, retryCount + 1);
  }
}
function generateThaiDetails(word) {
  if (!word) return null;

const prompt = `
    あなたはタイ語教育の最高権威です。単語「${word}」について、言語学的な視点と実戦的なコミュニケーションの両面から、完璧な解析を行ってください。
    
    ## 依頼内容
    単語「${word}」について、以下の制約を守って解析してください。
    例文(example_th)は、以下の3つのシーンから、単語の性質に最も合うものを一つ選んで作成してください。言語学習に利用するので、日常でも実践できる簡潔な文とし、専門用語はなるべく使わず、長すぎないようにしてください。また、単語ごとに空白やハイフンで区切るのは禁止です。以下はシーンの優先順です。
    1. 【日常会話】: 日常で使う必須フレーズ。普段の生活で頻出のやりとり。使用頻度が最も多い使い方を示してください。
    2. 【感情/関係性】: 恋人や親しい友人との親密なコミュニケーション、感情の機微を伝える表現。
    3. 【旅行/文化】: タイや日本の文化や歴史、現地の人々との深い精神的交流、旅でのフレーズ。
    
    ## 【特別ルール：多義語・同音異義語の取り扱い（単一の意味の単語はこのルールは無視せよ）】
    もし「${word}」が、全く異なる複数の意味や品詞を持つ多義語である場合（例: ผม, ถูก, ขัน, มัน など）、以下のフォーマットに従ってください。
    - meaning_ja,meaning_kana: 異なる意味を必ず箇条書き（1. 〇〇\\n2. 〇〇\\n3.・・・）で記載する。
    - category: 意味に対応する品詞を必ず次のフォーマット（1. 〇〇 2. 〇〇 3.・・・）で記載する。名詞の場合は類別詞も含めること。フォーマットは「名詞（類別詞: タイ語 発音）」
    - example_th, example_phonetic, example_ja: それぞれの意味に対する例文を、必ず箇条書き（1. 〇〇\\n2. 〇〇\\n3.・・・）で複数生成し、改行（\\n）で繋いで一つの文字列として出力する。example_thの生成ルールは依頼内容に従ってください。
    - explanation: それぞれの意味の使い分けや文脈の判断方法を網羅する。
    - 複数ある項目（category,meaning_ja,meaning_kana,example_th,example_phonetic,example_ja）の番号は必ず対応させてください。

    ## 出力制約
    - JSONオブジェクトのみを返してください。装飾や前置きは一切不要です。

    ## 発音表記（phonetic / example_phonetic）の厳守ルール
    - 音節ごとに必ず「-（ハイフン）」で繋いでください。
    - 各音節の母音の上に、5つの声調記号（á, à, â, ǎ, a）を必ず付与してください。
    - 【重要】特殊母音記号「ɛ, ɔ, ɯ」は積極的に使用してください。
    - アルファベット（ae, oo, uue）による代用ではなく、これら特殊記号の上に声調記号を乗せた表記を徹底してください。
    - 表記例 : thɔ́ɔng-fáa, sà-wàt-dii, khɔ̀ɔp-khun, phûut, mɯɯ, kɛ̂ɛo, khəəi

    ## 項目別ルール
    - category: 品詞を次から一つ選べ。動詞, 名詞, 形容詞, 副詞, 接続詞, 前置詞, 助動詞, 代名詞, 文末詞。名詞の場合は類別詞も含めること。フォーマットは「名詞（類別詞: タイ語 発音）」
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

// 共通エンジンを呼び出し
  let resultText = callGeminiApi(prompt);
  if (!resultText) return null;

  try {
    resultText = resultText.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(resultText);
  } catch(e) {
    console.error("JSONパースエラー", e);
    return null;
  }
}

function askAiTeacher(cardDataJson, memoText) {
  if (!cardDataJson || !memoText) return null;

  const prompt = `あなたはプロのタイ語教師です。
ユーザーは現在、以下の【単語カードデータ】を見ながら学習しています。

【単語カードデータ】
${cardDataJson}

ユーザーから学習メモを通じてテキストが送られてきました。
ユーザーの入力：『 ${memoText} 』

入力内容の「意図」を判断し、以下のルールに従って返答してください。

パターンA：ユーザーが「自分で作ったタイ語の文章」を書いている場合（作文・添削依頼）
修正案: （最も自然なタイ語。声調記号付き発音も）
解説: （なぜ修正したか、単語カードの情報を踏まえた解説）

パターンB：ユーザーが「日本語で質問」をしている場合
（単語カードの内容を踏まえ、質問に対する分かりやすい回答）

※回答のプレーンテキストのみを出力してください。挨拶や前置きは不要です。`;

  return callGeminiApi(prompt);
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
  
// ★修正：時間順（昇順）のソートを美しく保つため、英字ではなく「5桁のランダムな数字（00000〜99999）」にする
  const randomNum = Math.floor(Math.random() * 100000).toString().padStart(5, '0');

const dataMap = {
"id": "word_" + timestamp + randomNum,
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
 * スプレッドシート更新ロジック（行ズレによるID重複バグ完全対策版）
 */
function reGenerateCardById(targetId) {
  if (!targetId) return null;

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('m_vocabulary');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const idColIndex = headers.indexOf("id");
    const wordThColIndex = headers.indexOf("word_th");

    // 1. 【AI生成前】生成対象の「タイ語」だけを先に取得する
    let wordToProcess = "";
    for (let i = 1; i < data.length; i++) {
      if (data[i][idColIndex] === targetId) {
        wordToProcess = data[i][wordThColIndex];
        break;
      }
    }

    if (!wordToProcess) return null;

    // 2. AI詳細生成（★ここで5〜10秒の時間がかかる。この間に行がズレる可能性がある）
    const ai = generateThaiDetails(wordToProcess);
    if (!ai) return null;

    // 3. 【AI生成後】★最重要：書き込む直前に「最新のデータ」を再取得し、現在の行番号を探し直す！
    const newData = sheet.getDataRange().getValues();
    let finalRowIndex = -1;
    
    for (let i = 1; i < newData.length; i++) {
      if (newData[i][idColIndex] === targetId) {
        finalRowIndex = i + 1; // 最新の正しい行番号
        break;
      }
    }

    // もしAI生成中に、ユーザーがこの単語自体を「削除」していた場合は、書き込まずに安全に終了
    if (finalRowIndex === -1) return null;

    // 4. マッピングして上書き
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
      return dataMap[header] !== undefined ? dataMap[header] : newData[finalRowIndex - 1][index];
    });

    // ズレていない、最新の正しい行に書き込む！
    sheet.getRange(finalRowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
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


// メニューから手動実行するためのテスト用関数
function testAutoFiller() {
  AutoFiller.run();
}
// ==========================================
// ==========================================
// 4. 【新規】24時間フル稼働バッチ工場 (10分に1単語)
// ==========================================
const AutoFiller = {
  run: function() {
    // 🌟 ストッパーは撤去！24時間いつでも動きます

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('m_vocabulary'); 
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // ★ 例文（example_th）を基準にする
    const idx = {
      id: headers.indexOf('id'),
      word: headers.indexOf('word_th'),
      example_th: headers.indexOf('example_th') 
    };

    if (idx.id === -1 || idx.word === -1 || idx.example_th === -1) return;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const targetId = row[idx.id];
      const word = row[idx.word];
      const exampleVal = row[idx.example_th] ? row[idx.example_th].toString().trim() : "";

      // 🌟 例文が未生成（空文字 または "---"）のものを探す
      if (!exampleVal || exampleVal === "---") {
        console.log(`🏗️ 24時間フル稼働生成: ${word}`);
        
        const result = generateThaiDetails(word);

        if (result) {
          this.updateSheet(sheet, headers, targetId, result);
          console.log(`✅ 完了: ${word}`);
        } else {
          console.error(`❌ 失敗: ${word}`);
        }
        
        break; // 1件終わったら確実に終了
      }
    }
  },

  updateSheet: function(sheet, headers, targetId, aiData) {
    const data = sheet.getDataRange().getValues();
    const idColIndex = headers.indexOf("id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][idColIndex] === targetId) {
        const rowIndex = i + 1;
        const dataMap = {
          "phonetic": aiData.phonetic,
          "meaning_ja": aiData.meaning_ja,
          "meaning_kana": aiData.meaning_kana,
          "category": aiData.category,
          "example_th": aiData.example_th,
          "example_phonetic": aiData.example_phonetic,
          "example_ja": aiData.example_ja,
          "explanation": aiData.explanation,
          "last_update": new Date()
        };

        const updatedRow = headers.map((header, index) => {
          return dataMap[header] !== undefined ? dataMap[header] : data[i][index];
        });

        sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
        return;
      }
    }
  }
};