/**
 * ファイル名: core.gs
 * 役割: 画面表示と共通ヘルパー（ウィジェット対応版・日本語/英語GAS共通）
 */

function doGet(e) {
  const p = (e && e.parameter) || {};

  // 🌟 ウィジェット用API（?mode=json / ?mode=log）
  if (p.mode === 'json' || p.mode === 'log') {
    // 任意：スクリプトプロパティ WIDGET_TOKEN を設定した場合のみ照合
    const token = PropertiesService.getScriptProperties().getProperty('WIDGET_TOKEN');
    if (token && p.token !== token) return jsonOut_({ status: 'forbidden' });

    if (p.mode === 'json') return jsonOut_(widgetWords_());

    // 学習ログ記録（score: 3=簡単 / 2=普通 / 1=難しい）
    const score = Number(p.score);
    if (!p.id || [1, 2, 3].indexOf(score) === -1) return jsonOut_({ status: 'error' });
    try {
      saveLearningLog(p.id, score);
      return jsonOut_({ status: 'success' });
    } catch (err) {
      return jsonOut_({ status: 'error', message: String(err) });
    }
  }

  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('THAI-GO Engine')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 復習優先順の上位50件をウィジェット用に整形 */
function widgetWords_() {
  const first = function(s) {
    return String(s || '').split('\n')[0].replace(/^1\.\s*/, '');
  };
  try {
    return (getSpacedRepetitionData() || [])
      .slice(0, 50)
      .map(function(v) {
        return {
          id: String(v.id || ''),
          thai: v.word_th || v.word_en || v.word || '',
          roman: v.phonetic || '',
          meaning: first(v.meaning_ja),
          example: first(v.example_th || v.example_en || v.example),
          examplePhonetic: first(v.example_phonetic),
          exampleJa: first(v.example_ja)
        };
      })
      .filter(function(w) { return w.id && w.thai; });
  } catch (err) {
    return [];
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}