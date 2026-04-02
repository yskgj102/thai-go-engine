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
 * 学習データの取得（復習と新規のハイブリッド）
 * フロントエンド（Bridge.html）から呼ばれるメイン関数
 */
function getSpacedRepetitionData() {
  const vocabs = getRawVocabulary() || [];
  const logs = getRawLogs() || [];
  
  if (vocabs.length === 0) return [];

  const now = new Date().getTime();
  const stats = analyzeLogs(logs);

  let unlearned = [];
  let reviews = [];

  vocabs.forEach(function(obj) {
    const s = stats[obj.id];
    
    if (!s) {
      // 1. 新規単語の初期化
      obj.last_date = "New";
      obj.interval = 0;
      obj.priority_score = 2.0; // 新規は最高スコアで「赤」にする
      unlearned.push(obj);
    } else {
      // 2. 既習単語のスコア計算
      const diffHours = (now - s.lastDate) / 3600000;
      obj.interval = Math.floor(diffHours / 24);
      
      // 前回の成績に応じて重みを変える
      let power = CONFIG.POWER.HARD;
      if (s.lastScore === 3) power = CONFIG.POWER.EASY;
      else if (s.lastScore === 2) power = CONFIG.POWER.NORMAL;
      
      // 忘却曲線に基づいたスコアリング
      obj.priority_score = Math.sqrt(diffHours / power);
      obj.last_date = Utilities.formatDate(new Date(s.lastDate), "JST", "MM/dd HH:mm");
      reviews.push(obj);
    }
  });

  // スコア順に並び替え
  reviews.sort(function(a, b) { return b.priority_score - a.priority_score; });
  // 新規はランダムに混ぜる
  unlearned.sort(function() { return Math.random() - 0.5; });

  // 復習と新規をバランスよく混ぜてキューを作成
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
 * 学習ログの保存（Bridge.htmlから呼ばれる）
 */
function saveLearningLog(id, score) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('t_learning_logs');
  
  // シートがなければ作成
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
 * ヒートマップ用統計データの取得
 */
function getLearningStatistics() {
  const logs = getRawLogs() || [];
  const dataPoints = {};
  
  logs.forEach(function(log) {
    if (!log.created_at) return;
    
    const date = new Date(log.created_at);
    date.setHours(0, 0, 0, 0);
    const timestamp = Math.floor(date.getTime() / 1000); 
    
    dataPoints[timestamp] = (dataPoints[timestamp] || 0) + 1;
  });

  return dataPoints;
}