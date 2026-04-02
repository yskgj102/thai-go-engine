/**
 * クイック追加：項目名（ヘッダー）を基準にAI生成データをDBへ保存する
 */
function quickAddAutoFill(inputText) {
  if (!inputText) return { status: "error" };

  const isThai = /[\u0E00-\u0E7F]/.test(inputText);
  const word_th = isThai ? inputText : LanguageApp.translate(inputText, 'ja', 'th');

  // 1. 重複チェック（高速版）
  if (existsInVocabulary(word_th)) {
    // 重複していた場合、そのブロック内で完結させて return する
    const all = getRawVocabulary();
    const duplicate = all.find(v => v.word_th === word_th);
    return { status: "duplicate", word: word_th, data: duplicate };
  }
  // ★ ここにあった if (duplicate) ... の行は削除しました（エラーの原因）

  // 2. AI詳細生成
  const ai = generateThaiDetails(word_th);

  // 3. DB（スプレッドシート）のヘッダー情報を解析
  const sheet = SS.getSheetByName('m_vocabulary'); // db_access.gs の定数 SS を使用
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // 4. 書き込み用データのマッピング
  const timestamp = Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
  const newId = "word_" + timestamp;

  // AIからのレスポンスと基本情報を一つのオブジェクトにまとめる
  const dataMap = {
    "id": newId,
    "word_th": word_th,
    "phonetic": ai ? ai.phonetic : "---",
    "meaning_ja": ai ? ai.meaning_ja : (isThai ? "---" : inputText),
    "meaning_kana": ai ? ai.meaning_kana :  "---" ,
    "category": ai ? ai.category : "---",
    "example_th": ai ? ai.example_th : "---",
    "example_phonetic": ai ? ai.example_phonetic : "---",
    "example_ja": ai ? ai.example_ja : "---",
    "explanation": ai ? ai.explanation : "AI生成失敗",
    "ref_url": "" // カラム仕様に合わせて追加
  };

  // ヘッダーの並び順に従って、1行分のデータ配列を作成
  const newRow = headers.map(header => {
    return dataMap[header] !== undefined ? dataMap[header] : "";
  });

  // 5. シートの末尾に書き込み
  sheet.appendRow(newRow);

  // 6. アプリ側にデータを返却
  return { 
    status: "success", 
    word: word_th,
    data: {
      ...dataMap,
      interval: 0,
      last_date: "New"
    }
  };
}