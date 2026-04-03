/**
 * ファイル名: api_ai.gs
 */

/**
 * メインのAI生成ロジック：安全装置付き
 */
function generateThaiDetails(word, keyIndex = 1) {
  if (!word) return null;

  // --- 【安全装置】無限ループ防止 ---
  // APIキーの最大試行数を設定（例：10個まで）。これを超えたら強制終了します。
  const MAX_RETRY_LIMIT = 10; 
  if (keyIndex > MAX_RETRY_LIMIT) {
    console.error(`🛑 無限ループ防止のため、${MAX_RETRY_LIMIT}個目のキーで停止しました。`);
    return null;
  }

  const propName = `GEMINI_API_KEY_${keyIndex}`;
  const apiKey = PropertiesService.getScriptProperties().getProperty(propName);
  
  // 次のキー設定が空なら、そこで正常終了（ループ終了）
  if (!apiKey) {
    if (keyIndex === 1) {
      console.error("⚠️ GEMINI_API_KEY_1 が未設定です。");
    } else {
      console.warn(`🔚 ${propName} が未設定のため、キーの巡回を終了します。（計 ${keyIndex - 1} 個試行）`);
    }
    return null;
  }

  // URL、プロンプト、Payload、Optionsは山岡さんの「正解」を1ミリも変えず継承
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

const prompt = `
    あなたはタイ語教育の最高権威です。単語「${word}」について、言語学的な視点と実戦的なコミュニケーションの両面から、完璧な解析を行ってください。
    
    ## 出力制約
    - JSONオブジェクトのみを返してください。装飾や前置きは一切不要です。

    ## 発音表記（phonetic / example_phonetic）の厳守ルール
    - 音節ごとに必ず「-（ハイフン）」で繋いでください。
    - 各音節の母音の上に、5つの声調記号（á, à, â, ǎ, a）を必ず付与してください。
    - 【重要】特殊母音記号「ɛ, ɔ, ɯ」は積極的に使用してください。
    - アルファベット（ae, oo, uue）による代用ではなく、これら特殊記号の上に声調記号を乗せた表記を徹底してください。
    - 表記例：thɔ́ɔng-fáa, sà-wàt-dii, khɔ̀ɔp-khun, phûut, mɯɯ


    ## 項目別ルール
    - category: 品詞を次から一つ選べ。動詞, 名詞, 形容詞, 副詞, 接続詞, 前置詞, 助動詞, 代名詞, 文末詞。名詞の場合は類別詞も含めること
    - explanation: セクションごとに「改行2回（\\n\\n）」、項目内は「改行1回（\\n）」を使用。Markdown装飾（**等）は使用せず、記号（■、・、1.）で視認性を確保。

    ## explanationの記述ルール
    - セクションごとに「改行2回（\\n\\n）」、項目内は「改行1回（\\n）」を使用。
    - Markdown装飾は使用せず、記号（■、・、1.）などで視認性を確保してください。

    ## explanationの構成（全6項目を網羅してください）
    1. ■【語源と構成】: 単語の成り立ち。複成語の場合は各要素の意味を分解して解説。
    2. ■【核となるニュアンス】: 辞書的な意味を超えた、タイ人がその言葉を聞いた時に抱くイメージ。書き言葉（公式）か話し言葉（俗語）かの明示。
    3. ■【実戦的使い分け】: 日本人が混同しやすい類似表現との決定的な違い。使用すべきではない文脈や、丁寧度のグラデーション（丁寧/普通/粗野）。
    4. ■【類義語・反対語】: 
       類義語: 単語 (読み): 意味
       反対語: 単語 (読み): 意味
    5. ■【重要チャンク・成句】: 「${word}」を核とした、そのまま暗記すべき頻出フレーズを3つ以上。
    6. ■【例文の全単語解析】: 例文(example_th)を構成する全てのパーツについて、 単語: 意味 ([品詞]) の形式でリスト化。

    ## JSON Structure
    {
      "phonetic": "発音記号",
      "meaning_ja": "日本語の意味",
      "meaning_kana": "日本語の意味の読み（ひらがな）",
      "category": "品詞",
      "example_th": "自然で実用的な例文",
      "example_phonetic": "例文の発音記号",
      "example_ja": "例文の日本語訳",
      "explanation": "■【語源と構成】\\n（記述）\\n\\n■【核となるニュアンス】\\n（記述）\\n\\n■【実戦적使い分け】\\n（記述）\\n\\n■【類義語・反対語】\\n（記述）\\n\\n■【重要チャンク・成句】\\n1. \\n2. \\n3. \\n\\n■【例文の全単語解析】\\n単語: 意味 / 単語: 意味"
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
      "explanation": ai.explanation
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