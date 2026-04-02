/**
 * StudyManager: 学習ロジック・統計・ログ管理を統合
 */
const StudyManager = {
  
  // 設定値（マジックナンバーを排除）
  CONFIG: {
    LIMIT_PER_TYPE: 25,
    POWER: { EASY: 72.0, NORMAL: 24.0, HARD: 12.0 },
    USER_ID: "ryohei_y"
  },

  /**
   * 学習データの取得（復習と新規のハイブリッド）
   */
  getReviewData: function() {
    const vocabs = getRawVocabulary() || [];
    const logs = getRawLogs() || [];
    if (vocabs.length === 0) return [];

    const now = new Date().getTime();
    const stats = this._analyzeLogs(logs);

    const unlearned = [];
    const reviews = [];

    vocabs.forEach(obj => {
      const s = stats[obj.id];
      if (!s) {
        // 新規単語の初期化
        obj.last_date = "New";
        obj.interval = 0;
        obj.priority_score = 0.0; 
        unlearned.push(obj);
      } else {
        // 習得済み単語のスコア計算
        const diffHours = (now - s.lastDate) / 3600000;
        obj.interval = Math.floor(diffHours / 24);
        
        let power = (s.lastScore === 3) ? this.CONFIG.POWER.EASY : 
                    (s.lastScore === 2) ? this.CONFIG.POWER.NORMAL : this.CONFIG.POWER.HARD;
        
        obj.priority_score = Math.sqrt(diffHours / power);
        obj.last_date = Utilities.formatDate(new Date(s.lastDate), "JST", "MM/dd HH:mm");
        reviews.push(obj);
      }
    });

    // ソートと結合
    reviews.sort((a, b) => b.priority_score - a.priority_score);
    unlearned.sort(() => Math.random() - 0.5);

    return this._combineQueues(reviews, unlearned);
  },

  /**
   * 内部用：ログから最新の学習状態を抽出
   */
  _analyzeLogs: function(logs) {
    const stats = {};
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      if (!log || !log.vocab_id) continue;
      const vId = log.vocab_id;
      const time = new Date(log.created_at).getTime();
      if (!stats[vId] || time > stats[vId].lastDate) {
        stats[vId] = { lastDate: time, lastScore: Number(log.score) || 2 };
      }
    }
    return stats;
  },

  /**
   * 内部用：復習と新規をバランスよく結合
   */
  _combineQueues: function(reviews, unlearned) {
    let result = [];
    const limit = this.CONFIG.LIMIT_PER_TYPE;
    for (let i = 0; i < limit; i++) {
      if (reviews[i]) result.push(reviews[i]);
      if (unlearned[i]) result.push(unlearned[i]);
    }
    return [...result, ...reviews.slice(limit), ...unlearned.slice(limit)];
  },

  /**
   * 学習ログの保存
   */
  saveLog: function(id, score) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('t_learning_logs') || ss.insertSheet('t_learning_logs');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['log_id', 'user_id', 'vocab_id', 'score', 'answer_time_ms', 'device_info', 'created_at']);
    }
    sheet.appendRow([Utilities.getUuid(), this.CONFIG.USER_ID, id, Number(score), 0, "web-app", new Date()]);
    return { status: "success" };
  },

  /**
   * 今日の累計正解数を取得
   */
  getTodayScore: function() {
    const logs = getRawLogs();
    const today = Utilities.formatDate(new Date(), "JST", "yyyy-MM-dd");
    return logs.filter(log => {
      if (!log.created_at) return false;
      return Utilities.formatDate(new Date(log.created_at), "JST", "yyyy-MM-dd") === today;
    }).length;
  }
};


function getLearningStatistics() {
  const logs = getRawLogs() || [];
  const dataPoints = {};
  
  logs.forEach(log => {
    if (!log.created_at) return;
    
    // 日付を「その日の 00:00:00」のタイムスタンプ（秒）に変換
    const date = new Date(log.created_at);
    date.setHours(0, 0, 0, 0);
    const timestamp = Math.floor(date.getTime() / 1000); // ミリ秒から秒へ
    
    dataPoints[timestamp] = (dataPoints[timestamp] || 0) + 1;
  });

  return dataPoints; // frappe-charts が直接受け取れる形式
}
/**
 * HTML側から呼ばれるグローバル関数（インターフェース）
 */
function getSpacedRepetitionData() { return StudyManager.getReviewData(); }
function saveLearningLog(id, score) { return StudyManager.saveLog(id, score); }
function getTodayScore() { return StudyManager.getTodayScore(); }