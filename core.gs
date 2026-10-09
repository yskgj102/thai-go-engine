/**
 * ファイル名: core.gs
 * 役割: 画面表示と共通ヘルパー（ウィジェット対応版・日本語/英語GAS共通）
 * 追加: ?mode=bookmark（お気に入り設定） / ?mode=tts（クラウド音声）
 */

function doGet(e) {
  const p = (e && e.parameter) || {};

  // 🌟 ウィジェット用API（?mode=json / log / bookmark / tts）
  if (['json', 'log', 'bookmark', 'tts'].indexOf(p.mode) !== -1) {
    // 任意：スクリプトプロパティ WIDGET_TOKEN を設定した場合のみ照合
    const token = PropertiesService.getScriptProperties().getProperty('WIDGET_TOKEN');
    if (token && p.token !== token) return jsonOut_({ status: 'forbidden' });

    if (p.mode === 'json') return jsonOut_(widgetWords_());

    // お気に入り設定（value=1: ON / 0: OFF）※冪等
    if (p.mode === 'bookmark') {
      if (!p.id) return jsonOut_({ status: 'error' });
      try {
        return jsonOut_(setBookmark_(p.id, p.value === '1'));
      } catch (err) {
        return jsonOut_({ status: 'error', message: String(err) });
      }
    }

    // クラウド音声（base64 MP3 を JSON で返す）
    if (p.mode === 'tts') {
      const text = String(p.text || '').trim();
      if (!text || text.length > 300) return jsonOut_({ status: 'error' });
      try {
        const audio = ttsForWidget_(text, p.lang || 'th-TH');
        return jsonOut_(audio ? { status: 'success', audio: audio } : { status: 'error' });
      } catch (err) {
        return jsonOut_({ status: 'error', message: String(err) });
      }
    }

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
  // 品詞：「1. 動詞 2. 名詞」「名詞（類別詞: …）」→ 先頭の日本語だけ
  const cat = function(s) {
    return String(s || '').replace(/\d+\.\s*/g, '')
      .replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF].*$/, '').trim();
  };
  // 忘却度の色区分（本アプリの getColor と同じ基準）
  const status = function(v) {
    if (v.last_date === 'New') return 'new';
    const sc = parseFloat(v.priority_score) || 0;
    return sc > 1.2 ? 'red' : (sc > 0.8 ? 'yellow' : 'green');
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
          exampleJa: first(v.example_ja),
          level: Number(v.level) || 0,
          category: cat(v.category),
          status: status(v),
          bookmark: (v.is_bookmark === true || String(v.is_bookmark).toLowerCase() === 'true')
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