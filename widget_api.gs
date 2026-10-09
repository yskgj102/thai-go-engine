/**
 * ファイル名: widget_api.gs（新規追加）
 * 役割: ウィジェット専用のお気に入り設定・クラウド音声API
 * ※ 日本語GAS・英語GASの両プロジェクトに追加すること
 * ※ 既存の getCloudTTSAudio には触らない（Webアプリ側に影響を出さないため独立実装）
 */

/** お気に入りを明示的に ON/OFF する（冪等：何度送っても同じ結果） */
function setBookmark_(id, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('m_vocabulary');
  if (!sheet) return { status: 'error', message: 'sheet not found' };

  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { status: 'error', message: 'no data' };

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idIdx = headers.indexOf('id');
  const bmIdx = headers.indexOf('is_bookmark');
  if (idIdx === -1 || bmIdx === -1) return { status: 'error', message: 'column not found' };

  // 全件読みせず、id列だけをTextFinderで検索（2万語でも速い）
  const hit = sheet.getRange(2, idIdx + 1, lastRow - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  if (!hit) return { status: 'error', message: 'ID not found' };

  sheet.getRange(hit.getRow(), bmIdx + 1).setValue(!!value);
  return { status: 'success', is_bookmark: !!value };
}

/**
 * Google Cloud TTS → base64 MP3 を返す（言語別ボイス＋サーバー側キャッシュ）
 * 失敗時は null
 */
function ttsForWidget_(text, lang) {
  lang = lang || 'th-TH';

  // 6時間キャッシュ（CacheServiceの上限）。同じ語は2回目以降ほぼ即返せる
  const cache = CacheService.getScriptCache();
  const key = 'tts_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, lang + '|' + text));
  const hit = cache.get(key);
  if (hit) return hit;

  const apiKey = PropertiesService.getScriptProperties().getProperty('GCP_API_KEY');
  if (!apiKey) return null;

  const voices = {
    'th-TH': 'th-TH-Neural2-C',
    'en-US': 'en-US-Neural2-D',
    'ja-JP': 'ja-JP-Neural2-B'
  };

  const res = UrlFetchApp.fetch(
    'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + apiKey, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        input: { text: text },
        voice: { languageCode: lang, name: voices[lang] || voices['th-TH'] },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 }
      }),
      muteHttpExceptions: true
    });

  const json = JSON.parse(res.getContentText());
  if (!json.audioContent) {
    console.error('Widget TTS error: ', json);
    return null;
  }

  // CacheServiceは1値あたり約100KBまで
  if (json.audioContent.length < 95000) cache.put(key, json.audioContent, 21600);
  return json.audioContent;
}