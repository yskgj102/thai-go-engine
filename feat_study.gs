/**
 * 学習管理メイン：データの取得・統計・保存
 */

// --- 設定値 ---
const CONFIG = {
  LIMIT_PER_TYPE: 25,
  POWER: { EASY: 72.0, NORMAL: 24.0, HARD: 12.0 },
  USER_ID: "ryohei_y"
};
/**
 * 【新仕様】学習データの取得（爆速版）
 * ログシートは一切見ず、マスタ(m_vocabulary)の列だけでキューを生成する
 */
function getSpacedRepetitionData() {
  const vocabs = getRawVocabulary() || [];
  if (vocabs.length === 0) return [];

  const now = new Date().getTime();
  let unlearned = [];
  let reviews = [];

  vocabs.forEach(function(obj) {
    // 🌟 マスタの値（last_learned_date / last_score）を直接見る
    const lastLearned = obj.last_learned_date ? new Date(obj.last_learned_date).getTime() : null;
    const lastScore = obj.last_score !== "" ? Number(obj.last_score) : null;

    if (!lastLearned) {
      // 1. 新規単語の初期化
      obj.last_date = "New";
      obj.interval = 0;
      obj.priority_score = 2.0; // 新規は最高スコア
      unlearned.push(obj);
    } else {
      // 2. 既習単語のスコア計算
      const diffHours = (now - lastLearned) / 3600000;
      obj.interval = Math.floor(diffHours / 24);

      // 前回の成績に応じて重みを変える
      let power = CONFIG.POWER.HARD;
      if (lastScore === 3) power = CONFIG.POWER.EASY;
      else if (lastScore === 2) power = CONFIG.POWER.NORMAL;

      // 忘却曲線に基づいたスコアリング
      obj.priority_score = Math.sqrt(diffHours / power);
      obj.last_date = Utilities.formatDate(new Date(lastLearned), "JST", "MM/dd HH:mm");
      reviews.push(obj);
    }
  });

  reviews.sort(function(a, b) { return b.priority_score - a.priority_score; });
  unlearned.sort(function() { return Math.random() - 0.5; });

  return combineQueues(reviews, unlearned);
}

/**
 * ログから最新の学習状態を抽出（内部処理）
 */
function analyzeLogs(logs) {
  const stats = {};
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (!log || !log.vocab_id) continue;
    
    const vId = String(log.vocab_id);
    const time = new Date(log.created_at).getTime();
    
    if (!stats[vId] || time > stats[vId].lastDate) {
      stats[vId] = { 
        lastDate: time, 
        lastScore: Number(log.score) || 2 
      };
    }
  }
  return stats;
}

/**
 * 復習と新規をバランスよく結合（内部処理）
 */
function combineQueues(reviews, unlearned) {
  let result = [];
  const limit = CONFIG.LIMIT_PER_TYPE;
  
  for (let i = 0; i < limit; i++) {
    if (reviews[i]) result.push(reviews[i]);
    if (unlearned[i]) result.push(unlearned[i]);
  }
  
  // 残りのデータを全て結合
  const remainingReviews = reviews.slice(limit);
  const remainingUnlearned = unlearned.slice(limit);
  
  return result.concat(remainingReviews).concat(remainingUnlearned);
}
/**
 * 【新仕様】学習ログの保存（同時更新版）
 * ログを記録しつつ、マスタの最新状態も即座にアップデートする
 */
function saveLearningLog(id, score) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. ログシートへの追記 (ヒートマップ等の分析用)
  let sheet = ss.getSheetByName('t_learning_logs');
  if (!sheet) {
    sheet = ss.insertSheet('t_learning_logs');
    sheet.appendRow(['log_id', 'user_id', 'vocab_id', 'score', 'answer_time_ms', 'device_info', 'created_at']);
  }
  
  const logId = Utilities.getUuid();
  const createdAt = new Date();
  
  sheet.appendRow([
    logId, 
    CONFIG.USER_ID, 
    String(id), 
    Number(score), 
    0, 
    "web-app", 
    createdAt
  ]);

  // 🌟 2. 【ここがキモ】マスタ (m_vocabulary) 側の最新状態をピンポイントで更新
  const vocabSheet = ss.getSheetByName('m_vocabulary');
  const data = vocabSheet.getDataRange().getValues();
  const headers = data[0];

  const idIdx = headers.indexOf('id');
  const lastScoreIdx = headers.indexOf('last_score');
  const lastDateIdx = headers.indexOf('last_learned_date');

  if (idIdx !== -1 && lastScoreIdx !== -1 && lastDateIdx !== -1) {
    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx] === String(id)) {
        // スプレッドシートのRangeは1行目スタートなので i + 1
        vocabSheet.getRange(i + 1, lastScoreIdx + 1).setValue(Number(score));
        vocabSheet.getRange(i + 1, lastDateIdx + 1).setValue(createdAt);
        break;
      }
    }
  }

  return { status: "success" };
}
/**
 * 今日の累計正解数を取得
 */
function getTodayScore() {
  const logs = getRawLogs() || [];
  const todayStr = Utilities.formatDate(new Date(), "JST", "yyyy-MM-dd");
  
  const todayLogs = logs.filter(function(log) {
    if (!log.created_at) return false;
    const logDateStr = Utilities.formatDate(new Date(log.created_at), "JST", "yyyy-MM-dd");
    return logDateStr === todayStr;
  });
  
  return todayLogs.length;
}


/**
 * ヒートマップ用統計データの取得（直近120日分を動的に抽出）
 */
function getLearningStatistics() {
  const logs = getRawLogs() || [];
  const dataPoints = {};
  
  // 現在の年を取得
  const currentYear = new Date().getFullYear();
  
  logs.forEach(function(log) {
    if (!log.created_at) return;
    
    const date = new Date(log.created_at);
    
    // 現在の年（2026年）のログだけを集計対象にする
    if (date.getFullYear() === currentYear) {
      date.setHours(0, 0, 0, 0);
      const timestamp = Math.floor(date.getTime() / 1000); 
      dataPoints[timestamp] = (dataPoints[timestamp] || 0) + 1;
    }
  });

  return dataPoints;
}


/**
 * DB全件をスキャンし、解析が不安定（警告あり）かつ
 * まだ custom_split が設定されていない単語だけを抽出する
 */
function scanDbForWarnings() {
  console.log("🔍 === STARTING FULL DB WARNING SCAN ===");
  
  const allVocab = getRawVocabulary();
  const warningList = [];

  allVocab.forEach(item => {
    // 既に custom_split があるものは「解決済み」としてスキップ
    if (item.custom_split) return;

    try {
      const syllables = GS_Parser.parseSyllables(item.word_th, item);
      const meta = syllables.meta || { isReliable: true, warnings: [] };

      if (!meta.isReliable) {
        // 警告が出たものだけをリストに追加
        warningList.push({
          word: item.word_th,
          current_split: syllables.map(s => s.full).join('|'),
          reasons: meta.warnings.join(', ')
        });
      }
    } catch (e) {
      // エラー自体も重大な警告として扱う
      warningList.push({ word: item.word_th, current_split: "ERROR", reasons: e.message });
    }
  });

  // 結果の出力
  if (warningList.length === 0) {
    console.log("✅ 素晴らしい！警告が出る単語はゼロです。");
  } else {
    console.log(`⚠️ ${warningList.length} 件の不完全な単語が見つかりました：`);
    
    // スプレッドシートの「貼り付け用」に近い形式でログ出し
    warningList.forEach((res, i) => {
      console.log(`${i+1}. 【${res.word}】 現在の分割: [${res.current_split}]`);
      console.log(`   └ 理由: ${res.reasons}`);
    });

    // 最後に、コピーしやすいように「単語リスト」だけをカンマ区切りで出す
    const wordOnlyList = warningList.map(r => r.word).join(', ');
    console.log("\n📋 --- COPY & PASTE LIST ---");
    console.log(wordOnlyList);
  }

  console.log("🏁 === SCAN COMPLETE ===");
}
/**
 * カスタム分割データをスプレッドシートに保存する
 * @param {string} id - 単語のID
 * @param {string} splitArrayJson - JSON文字列化した分割配列 (例: '["รัด","ถะ","บาน"]')
 */
function updateCustomSplit(id, splitArrayJson) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("m_vocabulary"); // ★実際のシート名が 'words' か確認してください
    const data = sheet.getDataRange().getValues();
    const header = data[0];
    
    // ID列と custom_split列のインデックスを探す
    const idColIdx = header.indexOf("id");
    const splitColIdx = header.indexOf("custom_split");

    if (idColIdx === -1 || splitColIdx === -1) {
      throw new Error("ID列またはcustom_split列が見つかりません。シートのヘッダーを確認してください。");
    }

    // IDが一致する行を特定して書き込み
    for (let i = 1; i < data.length; i++) {
      if (data[i][idColIdx].toString() === id.toString()) {
        // スプレッドシートの Range は 1始まりなので +1
        sheet.getRange(i + 1, splitColIdx + 1).setValue(splitArrayJson);
        
        return { 
          status: "success", 
          message: "Saved to row " + (i + 1) 
        };
      }
    }
    return { status: "error", message: "ID not found: " + id };
  } catch (e) {
    console.error("updateCustomSplit Error:", e.toString());
    return { status: "error", message: e.toString() };
  }
}
  /**
 * メモ（memoカラム）を更新する
 * @param {string} id - 単語ID
 * @param {string} memoText - 入力されたメモ内容
 */
function updateWordMemo(id, memoText) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("m_vocabulary");
    const data = sheet.getDataRange().getValues();
    const header = data[0];
    
    const idColIdx = header.indexOf("id");
    const memoColIdx = header.indexOf("memo");

    if (idColIdx === -1 || memoColIdx === -1) throw new Error("ID or memo column missing");

    for (let i = 1; i < data.length; i++) {
      if (data[i][idColIdx].toString() === id.toString()) {
        sheet.getRange(i + 1, memoColIdx + 1).setValue(memoText);
        return { status: "success", data: memoText };
      }
    }
    return { status: "error", message: "ID not found" };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

// --- コード.gs の一番下などに追加 ---
function getCloudTTSAudio(text, langCode) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GCP_API_KEY');
  if (!apiKey) return null;

  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
  
  let voiceName = "th-TH-Neural2-C"; 
  if (langCode && langCode.includes("ja")) {
    voiceName = "ja-JP-Neural2-B";
  }

  const payload = {
    input: { text: text },
    voice: { languageCode: langCode || "th-TH", name: voiceName },
    audioConfig: { 
      audioEncoding: "MP3",
      speakingRate: 1.0 
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const res = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(res.getContentText());
    if (json.audioContent) {
      return json.audioContent; 
    } else {
      console.error("Cloud TTS Error: ", json);
      return null;
    }
  } catch (e) {
    console.error("UrlFetchApp Error: ", e);
    return null;
  }
}
