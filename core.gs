/**
 * ファイル名: core.gs
 * 役割: 画面表示と共通ヘルパー（ウィジェット用JSON対応版）
 */
function doGet(e) {
  // 🌟 ウィジェット用：?mode=json で単語リストをJSONで返す
  if (e && e.parameter && e.parameter.mode === 'json') {
    const list = (getSpacedRepetitionData() || [])
      .slice(0, 50)
      .map(function(v) {
        return {
          id: String(v.id || ''),
          thai: v.word_th || '',
          roman: v.phonetic || '',
          meaning: String(v.meaning_ja || '').split('\n')[0].replace(/^1\.\s*/, ''),
          example: String(v.example_th || '').split('\n')[0].replace(/^1\.\s*/, '')
        };
      })
      .filter(function(w) { return w.thai; });
    return ContentService.createTextOutput(JSON.stringify(list))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('THAI-GO Engine')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}