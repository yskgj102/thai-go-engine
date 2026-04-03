/**
 * ファイル名: db_access.gs
 * 役割: スプレッドシート（DB）への低レベルアクセスおよびデータ変換
 * --------------------------------------------------------------
 * [モジュール構成]
 * 1. 基礎アクセス: SpreadsheetAppのインスタンス保持
 * 2. 汎用変換: シートデータをオブジェクト配列（JSON形式）へ変換
 * 3. 高速クエリ: 特定カラムに絞った軽量なデータ確認
 * 4. 専用ラッパー: 各テーブル（マスタ/ログ）へのアクセス関数
 * --------------------------------------------------------------
 */

// --- 1. 基礎アクセス ---
const SS = SpreadsheetApp.getActiveSpreadsheet();

/**
 * --- 2. 汎用変換モジュール ---
 * シート名を指定して、1行目をキーにしたオブジェクト配列を返す。
 * 日付型はフロントエンドで扱いやすいISO8601形式の文字列に変換する。
 */
function getSheetDataAsObjects(sheetName) {
  const sheet = SS.getSheetByName(sheetName);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const headers = values[0];
  const rows = values.slice(1);

  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header) { 
        let val = row[index];
        obj[header] = val;
      }
    });
    return obj;
  });
}

/**
 * --- 3. 高速クエリ・モジュール ---
 * 2万語運用を見据え、全データを読み込まずに特定条件を確認する。
 */

/**
 * 高速重複チェック：列名 "word_th" を自動検索して判定する
 * 2万語運用を見据え、列順の変更に耐える「疎結合設計」
 */
function existsInVocabulary(wordTh) {
  const sheet = SS.getSheetByName('m_vocabulary');
  if (!sheet) return false;
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  // 1. まず1行目（ヘッダー）だけを取得して、"word_th" の列番号を探す
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const wordThColIndex = headers.indexOf("word_th");

  // 万が一、列名が見つからない場合の安全装置
  if (wordThColIndex === -1) {
    console.error("🚨 シートに 'word_th' 列が見つかりません。確認してください。");
    return false;
  }

  // 2. 特定した列（wordThColIndex + 1）のみをスキャン
  // getRange(開始行, 開始列, 行数, 列数)
  const data = sheet.getRange(2, wordThColIndex + 1, lastRow - 1, 1).getValues();
  
  // 3. 判定（フラット化して高速検索）
  return data.flat().includes(wordTh);
}

/**
 * --- 4. 専用ラッパー・モジュール ---
 * 各機能（feat_register等）から呼び出される標準的なデータ取得口。
 */

/**
 * 単語マスタ（m_vocabulary）の全データを取得
 */
function getRawVocabulary() {
  return getSheetDataAsObjects('m_vocabulary');
}

/**
 * 学習ログ（t_learning_logs）の全データを取得
 */
function getRawLogs() {
  return getSheetDataAsObjects('t_learning_logs');
}



