/**
 * 単語マスターのIDを最新形式に統一し、学習ログの紐付けを同期する
 */
function finalMigrationFixed() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const vocabSheet = ss.getSheetByName('m_vocabulary');
  const logSheet = ss.getSheetByName('t_learning_logs');
  
  // 単語マスターデータの読み込み
  const vocabData = vocabSheet.getDataRange().getValues();
  const vocabHeaders = vocabData[0];
  const idIdx = vocabHeaders.indexOf("id");
  const wordIdx = vocabHeaders.indexOf("word_th");

  const idUpdateMap = {}; // 旧IDから新IDへの変換マップ（ログ更新用）
  const nowBase = Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmm");
  
  console.log("1. 旧形式ID (連番) のスキャンを開始...");
  
  for (let i = 1; i < vocabData.length; i++) {
    let rawValue = vocabData[i][idIdx];
    // 空セルやundefinedを安全に文字列化してトリム
    let oldId = (rawValue !== null && rawValue !== undefined) ? rawValue.toString().trim() : "";
    
    // 【判定条件】
    // 1. 空文字である
    // 2. word_ で始まっていない
    // 3. word_ 以降の数字が8桁未満（word_0000001 等の旧連番形式）
    const matchDigits = oldId.match(/\d+/);
    const isOldFormat = oldId === "" || 
                        !oldId.startsWith("word_") || 
                        (matchDigits && matchDigits[0].length < 8);

    if (isOldFormat) {
      // 新しいIDを生成 (例: word_202603261900 + 行番号3桁で一意性を確保)
      const newId = "word_" + nowBase + i.toString().padStart(3, '0');
      vocabData[i][idIdx] = newId; 
      
      // ログの書き換えが必要なため、旧IDと新IDのペアをマップに保存
      if (oldId !== "") {
        idUpdateMap[oldId] = newId;   
      }
      console.log(`ID修正対象: [${vocabData[i][wordIdx]}] ${oldId} -> ${newId}`);
    }
  }

  // 2. 学習ログの同期（マスターのID変更をログ側にも反映）
  const logData = logSheet.getDataRange().getValues();
  let logUpdateCount = 0;
  const logHeaders = logData[0];
  const logIdIdx = logHeaders.indexOf("vocab_id"); // ログ側の紐付け列

  if (logIdIdx === -1) {
    throw new Error("t_learning_logs シートに 'vocab_id' 列が見つかりません。");
  }

  if (logData.length > 1) {
    for (let j = 1; j < logData.length; j++) {
      let rawLogId = logData[j][logIdIdx];
      let currentLogId = (rawLogId !== null && rawLogId !== undefined) ? rawLogId.toString().trim() : "";
      
      // ログのIDが変換マップに存在する場合、新IDに置換して紐付けを維持
      if (currentLogId !== "" && idUpdateMap[currentLogId]) {
        logData[j][logIdIdx] = idUpdateMap[currentLogId];
        logUpdateCount++;
      }
    }
  }

  // 3. ユーザーへの実行確認
  const ui = SpreadsheetApp.getUi();
  const msg = `【実行内容】\n・修正するマスタID: ${Object.keys(idUpdateMap).length}件\n・更新する学習ログ: ${logUpdateCount}件\n\nよろしいですか？`;
  
  if (ui.alert('マイグレーション開始', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  // 4. シートへの一括書き戻し（パフォーマンス向上のためRange指定で一気に書き込む）
  vocabSheet.getRange(1, 1, vocabData.length, vocabHeaders.length).setValues(vocabData);
  logSheet.getRange(1, 1, logData.length, logHeaders.length).setValues(logData);

  ui.alert('完了', 'すべてのIDが最新形式に統一され、ログとの紐付けも維持されました。', ui.ButtonSet.OK);
}

/**
 * 単語マスターに存在しない ID を持つ学習ログを削除する（UIエラー回避版）
 */
function cleanupOrphanedLogs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const vocabSheet = ss.getSheetByName('m_vocabulary');
  const logSheet = ss.getSheetByName('t_learning_logs');

  if (!vocabSheet || !logSheet) {
    console.error('シートが見つかりません');
    return;
  }

  // 1. 有効な単語IDのセットを作成
  const vocabData = vocabSheet.getDataRange().getValues();
  const vIdIdx = vocabData[0].indexOf("id");
  
  const validIds = new Set();
  for (let i = 1; i < vocabData.length; i++) {
    const id = vocabData[i][vIdIdx];
    if (id) validIds.add(id.toString().trim());
  }

  // 2. 学習ログのスキャン
  const logData = logSheet.getDataRange().getValues();
  const logHeaders = logData[0];
  const logIdIdx = logHeaders.indexOf("vocab_id");
  
  const cleanLogs = [logHeaders];
  let deleteCount = 0;

  for (let j = 1; j < logData.length; j++) {
    const logVocabId = logData[j][logIdIdx] ? logData[j][logIdIdx].toString().trim() : "";
    
    if (validIds.has(logVocabId)) {
      cleanLogs.push(logData[j]);
    } else {
      deleteCount++;
    }
  }

  // 3. 実行（UIアラートを使わずログに書き出す）
  console.log(`スキャン完了。無効なログ: ${deleteCount} 件 / 総ログ数: ${logData.length - 1} 件`);

  if (deleteCount > 0) {
    // データ保護のため、元のシートをクリアして書き戻し
    logSheet.clearContents();
    logSheet.getRange(1, 1, cleanLogs.length, logHeaders.length).setValues(cleanLogs);
    console.log(`${deleteCount} 件の無効なログを完全に削除しました。`);
  } else {
    console.log("削除対象はありませんでした。整合性は保たれています。");
  }
}

/**
 * 単語マスターのIDをソースコードの標準仕様 (word_YYYYMMDDHHmmss) に強制統一する
 * UIを表示せず、サーバーコンテキストで直接実行可能。
 */
function syncVocabIdsWithSourceSpec() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const vocabSheet = ss.getSheetByName('m_vocabulary');
  
  if (!vocabSheet) {
    console.error("Sheet 'm_vocabulary' not found.");
    return;
  }

  const range = vocabSheet.getDataRange();
  const vocabData = range.getValues();
  const vocabHeaders = vocabData[0];
  const idIdx = vocabHeaders.indexOf("id");

  if (idIdx === -1) {
    console.error("'id' column not found.");
    return;
  }

  // ソース仕様: word_ + 14桁 (YYYYMMDDHHmmss)
  const timestamp = Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
  let updateCount = 0;

  console.log(`Migration Start: Base Timestamp ${timestamp}`);

  for (let i = 1; i < vocabData.length; i++) {
    const oldId = (vocabData[i][idIdx] || "").toString().trim();
    
    // 判定: word_ + 14桁数字 ではないものはすべて更新
    const isStandardFormat = /^word_\d{14}/.test(oldId);

    if (!isStandardFormat) {
      // 5桁パディングで一意性を確保
      const newId = `word_${timestamp}${i.toString().padStart(5, '0')}`;
      vocabData[i][idIdx] = newId;
      updateCount++;
      
      if (i % 2000 === 0) {
        console.log(`Progress: ${i} rows processed...`);
      }
    }
  }

  if (updateCount === 0) {
    console.log("No updates needed. All IDs are already up to spec.");
    return;
  }

  // UI確認を挟まずに直接書き戻し
  range.setValues(vocabData);
  
  console.log(`Migration Success: ${updateCount} IDs updated to standard format.`);
}

/**
 * word_th の重複を排除し、最新のIDを持つ行だけを残す（お掃除関数）
 */
function cleanupDuplicateVocab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const vocabSheet = ss.getSheetByName('m_vocabulary');
  
  if (!vocabSheet) return console.error("Sheet 'm_vocabulary' not found.");

  const range = vocabSheet.getDataRange();
  const data = range.getValues();
  const headers = data[0];
  const idIdx = headers.indexOf("id");
  const wordIdx = headers.indexOf("word_th");

  if (idIdx === -1 || wordIdx === -1) return console.error("Required columns not found.");

  // 重複を判定するためのマップ（key: word_th, value: row_data）
  const uniqueMap = new Map();
  let duplicateCount = 0;

  console.log("重複スキャンを開始...");

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const word = (row[wordIdx] || "").toString().trim();
    const id = (row[idIdx] || "").toString().trim();

    if (!word) continue;

    if (uniqueMap.has(word)) {
      // 既に存在する場合、IDを比較して新しい方（文字列として大きい方）を残す
      const existingRow = uniqueMap.get(word);
      const existingId = existingRow[idIdx].toString();
      
      if (id > existingId) {
        uniqueMap.set(word, row); // 今回の行の方が新しいので差し替え
      }
      duplicateCount++;
    } else {
      uniqueMap.set(word, row);
    }
  }

  if (duplicateCount === 0) {
    console.log("重複は見つかりませんでした。");
    return;
  }

  // 書き出し用データの再構築（ヘッダー + ユニークな行）
  const cleanData = [headers, ...Array.from(uniqueMap.values())];

  // シートをクリアして一括書き込み
  vocabSheet.clearContents();
  vocabSheet.getRange(1, 1, cleanData.length, headers.length).setValues(cleanData);

  console.log(`掃除完了: ${duplicateCount}件の重複を削除しました。現在の総単語数: ${cleanData.length - 1}件`);
}
/**
 * ログ容量制限を回避：全ファイルを1つのGoogleドキュメントに出力する
 */
function exportToDoc() {
  const fileNames = [
    'AppState', 'AudioSystem', 'Bridge', 'StudyEngine', 
    'ViewController', 'VocabListUI', 'index', 'css_main',
    'api_ai', 'core', 'db_access', 'feat_register', 'feat_study', 'マイグレーション'
  ];
  
  // 1. 新しいGoogleドキュメントを作成
  const doc = DocumentApp.create('Yamaoka_Project_Export_' + new Date().getTime());
  const body = doc.getBody();
  
  body.appendParagraph("=== YAMAOKA PROJECT FULL EXPORT ===").setHeading(DocumentApp.ParagraphHeading.HEADING1);

  fileNames.forEach(name => {
    try {
      const content = HtmlService.createHtmlOutputFromFile(name).getContent();
      
      body.appendParagraph(`FILE: ${name}`).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(content).setFontFamily('Courier New').setFontSize(9);
      body.appendPageBreak();
      
      console.log(`${name} を書き込みました...`);
    } catch (e) {
      body.appendParagraph(`ERROR: ${name} の取得に失敗しました`).setForegroundColor('#FF0000');
    }
  });

  // 2. 作成したドキュメントのURLをログに出す
  const url = doc.getUrl();
  console.log("✅ 完了しました！以下のURLを開いて、中身を全コピーして私に投げてください。");
  console.log(url);
}