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
}/**
 * プロジェクト内の全コード（.gs / .html）を一括取得してログに出力する
 * 実行後、表示されるログを全コピーしてAIに渡してください。
 */
function exportAllProjectFiles() {
  const scriptId = ScriptApp.getScriptId();
  const accessToken = ScriptApp.getOAuthToken();
  
  // Google Apps Script API を叩いてプロジェクトの内容を取得
  const url = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
  const options = {
    method: "get",
    headers: { Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());
  
  if (!data.files) {
    Logger.log("ファイルを取得できませんでした。APIの設定を確認してください。");
    return;
  }
  
  let output = "=== GAS PROJECT EXPORT ===\n\n";
  
  data.files.forEach(file => {
    output += `// --- FILE: ${file.name}.${file.type === 'HTML' ? 'html' : 'gs'} ---\n`;
    output += file.source + "\n\n";
  });
  
  // ログに出力（表示制限がある場合は、この文字列をGoogleドキュメントに書き出す等も可能）
  Logger.log(output);
  
  // 念のため、実行完了のトーストを表示
  console.log("Export Complete. Please check the Execution Log.");
}


/**
 * スプレッドシートの custom_split 列を一括更新するスクリプト
 */
function updateCustomSplitBulk() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("m_vocabulary"); // ★シート名が違う場合は書き換えてください
  
  // 1. 最新の例外辞書データ（ここをマスターとして運用します）
  const masterDict = {

    // --- 交通・場所関連 ---
    "ขี่รถ": ["ขี่", "รถ"],
    "รถติด": ["รถ", "ติด"],
    "ถนนใหญ่": ["ถ", "นน", "ใหญ่"],
    "วงเวียน": ["ว", "ง", "เวียน"],
    "สถานีรถไฟฟ้า": ["ส", "ถา", "นี", "รถ", "ไฟ", "ฟ้า"],
    "จราจร": ["จ", "รา", "จร"],
    "ทางม้าลาย": ["ทาง", "ม้า", "ลาย"],
    
    // --- 社会・公的単語 ---
    "ปกติ": ["ป", "ก", "ติ"],
    "ผิดปกติ": ["ผิด", "ป", "ก", "ติ"],
    "นิทรรศการ": ["นิ", "ทรรศ", "การ"],
    "รสชาติ": ["รส", "ชาติ"],
    "ทัศนคติ": ["ทัศ", "น", "ค", "ติ"],
    "กำหนดการ": ["กำ", "หนด", "การ"],
    "สถาปัตยกรรมไทย": ["ส", "ถา", "ปัต", "ย", "กรรม", "ไทย"],
    
    // --- 時間・カレンダー ---
    "วันพฤหัสบดี": ["วัน", "พฤ", "หัส", "บ", "ดี"],
    "เดือนพฤษภาคม": ["เดือน", "พฤ", "ษ", "ภา", "คม"],
    "เดือนกรกฎาคม": ["เดือน", "กร", "ก", "ฎา", "คม"],
    "เดือนพฤศจิกายน": ["เดือน", "พฤศ", "จิ", "กา", "ยน"],
    
    // --- 抽象概念・心理 ---
    "ความสะดวกสบาย": ["ความ", "ส", "ดว", "ก", "ส", "บาย"],
    "ความเห็นอกเห็นใจ": ["ความ", "เห็น", "อก", "เห็น", "ใจ"],
    "ความสงบสุข": ["ความ", "ส", "งบ", "สุข"],
    "ความทรงจำ": ["ความ", "ทรง", "จำ"],
    "ความสมบูรณ์": ["ความ", "สม", "บูรณ์"],
    "ความสมดุล": ["ความ", "สม", "ดุล"],
    
    // --- その他地雷 ---
    "ไม้บรรทัด": ["ไม้", "บรร", "ทัด"],
    "ชมพู": ["ชม", "พู"],
    "ตรงไป": ["ตรง", "ไป"],
    "ตรงเวลา": ["ตรง", "เวลา"],
    "องศา": ["อง", "ศา"],
    "มลพิษ": ["มล", "พิษ"],
    "จดจ่อ": ["จด", "จ่อ"],
    "คนแก่": ["คน", "แก่"],
    "ตกใจ": ["ตก", "ใจ"],
    // ─────────────────────────────
    // 1. 引導子音（隠れた ห）/ 孤立子音の警告回避
    // ─────────────────────────────
    "สนุก": ["ส", "หนุก"],             // 楽しい
    "สบาย": ["ส", "บาย"],             // 快適な
    "สะอาด": ["ส", "อาด"],             // 清潔な
    "สกปรก": ["สก", "กะ", "ปรก"],        // 汚い
    "สว่าง": ["ส", "หว่าง"],             // 明るい
    "เสมอ": ["ส", "เหมอ"],             // いつも
    "สมุด": ["ส", "หมุด"],             // ノート
    "สนาม": ["ส", "หนาม"],             // 広場
    "แสดง": ["ส", "แดง"],             // 示す・演じる
    "สถิติ": ["ส", "ถิ", "ติ"],          // 統計
    "สถานการณ์": ["ส", "ถาน", "นะ", "กาน"], // 状況
    "สวัสดิการ": ["ส", "วัด", "ดิ", "กาน"], // 福祉
    "สวัสดี": ["ส", "วัด", "ดี"],         // こんにちは
    "ตลอด": ["ต", "หลอด"],             // ずっと（ตลอดไป 用）
    "ตลาด": ["ต", "หลาด"],             // 市場
    "ตลก": ["ต", "หลก"],               // 面白い
    "อร่อย": ["อ", "หร่อย"],           // 美味しい
    "อธิบาย": ["อ", "ทิ", "บาย"],        // 説明する
    "อวัยวะ": ["อ", "วัย", "ยะ", "วะ"],    // 器官
    "อนุญาต": ["อ", "นุ", "ยาด"],        // 許可する
    "ขนาด": ["ข", "หนาด"],             // サイズ
    "ขยะ": ["ข", "หยะ"],               // ゴミ
    "ขยัน": ["ข", "หยัน"],             // 勤勉な
    "ฝรั่งเศส": ["ฝ", "หรั่ง", "เสด"],      // フランス
    "สิงคโปร์": ["สิง", "คะ", "โป"],       // シンガポール
    "สติกเกอร์": ["ส", "ติก", "เก้อ"],      // ステッカー

    // ─────────────────────────────
    // 2. 黙字記号(์)がないのに読まない文字（沈黙の失敗を防ぐ）
    // （末尾の ิ, ุ や、発音しない ร などを補正）
    // ─────────────────────────────
    "เหตุ": ["เหด"],                   // 理由（เหตุผล, อุบัติเหตุ などのパーツ）
    "เหตุผล": ["เหด", "ผน"],           // 理由
    "อุบัติเหตุ": ["อุ", "บัด", "ติ", "เหด"], // 事故
    "ภูมิ": ["พูม"],                   // 地位（อุณหภูมิ, ภูมิใจ などのパーツ）
    "ภูมิใจ": ["พูม", "ใจ"],             // 誇りに思う
    "อุณหภูมิ": ["อุน", "หะ", "พูม"],      // 温度
    "ญาติ": ["ยาด"],                   // 親戚
    "ชาติ": ["ชาด"],                   // 国・生まれ
    "ธรรมชาติ": ["ทำ", "ม", "ชาด"],      // 自然
    "ประวัติ": ["ประ", "หวัด"],          // 歴史（ประวัติศาสตร์ 用）
    "ประวัติศาสตร์": ["ประ", "หวัด", "ติ", "สาด"], // 歴史
    "บัตร": ["บัด"],                   // カード（บัตรเครดิต 用）
    "เมตร": ["เมด"],                   // メートル（กิโลเมตร, เซนติเมตร 用）
    "กิโลเมตร": ["กิ", "โล", "เมด"],     // キロメートル
    "เซนติเมตร": ["เซน", "ติ", "เมด"],   // センチメートル
    "ลิตร": ["ลิด"],                   // リットル
    "จริง": ["จิง"],                   // 本当
    "สร้าง": ["ส้าง"],                  // 作る
    "สามารถ": ["สา", "มาด"],           // できる
    "ปรารถนา": ["ปราด", "ถ", "หนา"],     // 願望

    // ─────────────────────────────
    // 3. 二重機能子音 (Overlap) & 複雑なサンスクリット由来語
    // ─────────────────────────────
    "ผลไม้": ["ผล", "ล", "ไม้"],       // 果物
    "คุณภาพ": ["คุน", "น", "ภาพ"],     // 品質
    "สุขภาพ": ["สุก", "ข", "ภาพ"],     // 健康
    "ประสิทธิภาพ": ["ประ", "สิด", "ทิ", "ภาพ"], // 効率
    "รัฐบาล": ["รัด", "ถะ", "บาน"],    // 政府
    "ศาสนา": ["สาด", "ส", "หนา"],      // 宗教
    "วัฒนธรรม": ["วัด", "ถะ", "นะ", "ทำ"], // 文化
    "เศรษฐกิจ": ["เสด", "ถะ", "กิด"],    // 経済
    "สัญลักษณ์": ["สัน", "ย", "ลัก"],     // 象徴
    "วิทยุ": ["วิท", "ท", "ยุ"],       // ラジオ
    "ราชวงศ์": ["ราด", "ช", "วง"],     // 王室
    "ธรรมดา": ["ทำ", "ม", "ดา"],       // 普通
    "จักรยาน": ["จัก", "กะ", "ยาน"],     // 自転車
    "มหาวิทยาลัย": ["ม", "หา", "วิท", "ท", "ยา", "ลัย"], // 大学
    "ประสบการณ์": ["ประ", "สบ", "กาน"],  // 経験
    "โทรศัพท์": ["โท", "ระ", "สับ"],     // 電話
    "โทรทัศน์": ["โท", "ระ", "ทัด"],     // テレビ
    "ภาพยนตร์": ["พาบ", "พะ", "ยน"],     // 映画
    "ปรากฏการณ์": ["ปรา", "กด", "กาน"],  // 現象
    "วิวัฒนาการ": ["วิ", "วัด", "ทะ", "นา", "กาน"], // 進化
    "อุตสาหกรรม": ["อุด", "สา", "หะ", "กำ"], // 産業
    "พจนานุกรม": ["พด", "จะ", "นา", "นุ", "กรม"], // 辞書
    "อังกฤษ": ["อัง", "กฤษ"],          // イギリス
    "กษัตริย์": ["กะ", "สัด"],           // 王
    "พยายาม": ["พ", "ยา", "ยาม"],       // 努力する

    // 【カレンダー・月名】（これらは非常に不規則です）
    "มกราคม": ["มก", "กะ", "รา", "คม"],      // 1月 (mo-ka-ra)
    "กุมภาพันธ์": ["กุม", "พา", "พัน"],        // 2月 (silent th-u)
    "พฤษภาคม": ["พฤด", "สะ", "พา", "คม"],     // 5月 (phruet-sa)
    "กรกฎาคม": ["กะ", "ระ", "กะ", "ดา", "คม"], // 7月 (ka-ra-ka-da)
    "พฤศจิกายน": ["พฤด", "สะ", "จิ", "กา", "ยน"], // 11月 (phruet-sa-chi)
    "สัปดาห์": ["สับ", "ดา"],                // 週 (sap-da / r読まない)

    // 【学問・教育】
    "วิทยาศาสตร์": ["วิด", "ทะ", "ยา", "สาด"],  // 科学 (wit-thaya)
    "คณิตศาสตร์": ["คะ", "นิด", "ตะ", "สาด"],   // 算数・数学 (kha-nit-ta)
    "พุทธศาสนา": ["พุด", "ทะ", "สาด", "สะ", "หนา"], // 仏教
    "ปัญญา": ["ปัน", "ยา"],                  // 知恵 (ny -> n)
    "สถาบัน": ["ส", "ถา", "บัน"],             // 研究所・機関 (Aksorn Nam)

    // 【社会的・公的単語】
    "กรุงเทพฯ": ["กรุง", "เท็บ"],              // バンコク (省略記号の処理)
    "อิทธิพล": ["อิด", "ทิ", "ผน"],            // 影響 (it-thi-phon)
    "สวัสดิ์": ["สวัส", "ดี"],                 // 幸福・成功 (Sawaddiの語根)
    "สมบูรณ์": ["สม", "บูน"],                 // 完璧な・完全な (Overlap回避)
    "มิตร": ["มิด"],                         // 友達・友人 (rを読まない)
    "พุทธ": ["พุด"],                         // 仏陀・仏教の (Dead扱い)
    "ภรรยา": ["พัน", "ระ", "ยา"],             // 妻 (Ro Han の特殊形)
    "ทหาร": ["ทะ", "หาน"],                   // 軍人 (r -> n)
    "กิโลเมตร": ["กิ", "โล", "เมด"],            // キロメートル (外来語再掲)
    "สุวรรณภูมิ": ["สุ", "วรรณ", "นะ", "พูม"],   // スワンナプーム (地名)

    // 【動詞・副詞】
    "พยายาม": ["พ", "ยา", "ยาม"],             // 努力する (孤立警告回避)
    "ปฏิเสธ": ["ปะ", "ติ", "เสด"],             // 拒否する (不規則)
    "พยากรณ์": ["พะ", "ยา", "กอน"],           // 予測する (不規則)
    "พิเศษ": ["พิ", "เสด"]        ,            // 特別な (末子音規則)

    // ─────────────────────────────
    // 4. 「ทร」を「ซ（s）」と発音する絶対的例外（False Clusters）
    // （※プログラムは「t + r」と読んでしまうため、カンペで「ซ」に変換します）
    // ─────────────────────────────
    "ทราบ": ["ซาบ"],                 // 承知する (sap)
    "ทราย": ["ซาย"],                 // 砂 (sai)
    "ทรง": ["ซง"],                   // 〜なさる、形 (song)
    "ทรุดโทรม": ["ซุด", "โซม"],        // 荒廃する (sut-som)
    "กระทรวง": ["กระ", "ซวง"],         // 省庁 (kra-suang)
    "ทรัพย์": ["ซับ"],                 // 財産 (sap)
    "พุทรา": ["พุด", "ซา"],            // ナツメ (phut-sa)
    "แทรก": ["แซก"],                 // 挿入する (saek)

    // ─────────────────────────────
    // 5. 特殊な文字の読み方・黙字（Silent Letters）
    // ─────────────────────────────
    "เศร้า": ["เส้า"],                 // 悲しい（รを読まない）
    "เสร็จ": ["เส็ด"],                 // 終わる（รを読まない、็ で短音化）
    "เพชร": ["เพ็ด"],                 // ダイヤモンド（รを読まない）
    "พราหมณ์": ["พราม"],              // バラモン（หมณ を読まない超例外）
    "ศูนย์": ["สูน"],                 // ゼロ（ย を読まない）
    "สมบูรณ์": ["สม", "บูน"],          // 完璧な（Overlap回避、ร 発音しない）
    "พยาธิ": ["พะ", "ยาด"],           // 寄生虫/病気（พะยาติ ではない）
    "ปาฏิหาริย์": ["ปา", "ติ", "หาน"],   // 奇跡（複雑な黙字）

    // ─────────────────────────────
    // 6. ビジネス・社会で頻出する「Overlap（二重機能子音）」
    // ─────────────────────────────
    "บริษัท": ["บอ", "ริ", "สัด"],       // 会社
    "ธุรกิจ": ["ทุ", "ระ", "กิด"],       // ビジネス
    "กิจการ": ["กิด", "จะ", "กาน"],     // 事業
    "อุตสาหกรรม": ["อุด", "สา", "หะ", "กำ"], // 産業
    "พนักงาน": ["พะ", "นัก", "งาน"],   // 従業員
    "สรรพสินค้า": ["สับ", "พะ", "สิน", "ค้า"], // デパート（ห้างสรรพสินค้า 用）
    "คุณภาพ": ["คุน", "นะ", "พาบ"],    // 品質
    "สุขภาพ": ["สุก", "ขะ", "พาบ"],    // 健康
    "เคารพ": ["เคา", "รบ"],          // 尊敬する
    "อดีต": ["อ", "ดีด"],             // 過去 (Overlap + 孤立回避)
    "อนาคต": ["อ", "นา", "คด"],       // 未来 (Overlap + 孤立回避)

    // ─────────────────────────────
    // 7. 生活・日常会話の「隠れた ห (引導子音)」と「不規則な区切り」
    // ─────────────────────────────
    "ขยับ": ["ข", "หยับ"],             // 動く・ずらす
    "ขยาย": ["ข", "หยาย"],            // 拡大する
    "สมอง": ["ส", "หมอง"],            // 脳
    "สลับ": ["ส", "หลับ"],             // 入れ替える
    "สนับสนุน": ["ส", "หนับ", "ส", "หนุน"], // 支援する
    "สวิทช์": ["ส", "หวิด"],            // スイッチ（英語由来・不規則）
    "ผลิต": ["ผ", "หลิด"],             // 生産する
    "ผลิตภัณฑ์": ["ผ", "หลิด", "ตะ", "พัน"], // 製品
    "ฝรั่ง": ["ฝ", "หรั่ง"],             // 西洋人・グアバ
    "สตรอว์เบอร์รี": ["สะ", "ตรอ", "เบอ", "รี่"], // イチゴ（外来語の極致）
    "ตุ๊กตา": ["ตุ๊ก", "กะ", "ตา"]     ,   // 人形（Overlap）

    "ผลไม้": ["ผล", "ล", "ไม้"],       // 果物
    "ขรุขระ": ["ขรุ", "ขระ"],          // でこぼこ
    "สรรพคุณ": ["สรรพ", "พ", "คุณ"],   // 効能
    "พฤษภาคม": ["พฤด", "สะ", "พา", "คม"], // 5月
    "ทฤษฎี": ["ทฤด", "สะ", "ดี"],      // 理論
    "อังกฤษ": ["อัง", "กิด"],          // イギリス (ษの孤立を防ぐ発音カンペ)
    "กษัตริย์": ["กะ", "สัด"],           // 王 (ริย์ は黙字なので無視するカンペ)
    "กรุงเทพฯ": ["กรุง", "เท็บ"],       // バンコク (ฯ の記号を無視するカンペ)
    "อินเทอร์เน็ต": ["อิน", "เทอ", "เน็ด"], // インターネット (英語由来の不規則を修正)
    "สนุก": ["ส", "หนุก"],             // 楽しい (ห引導を明示)
    "อร่อย": ["อ", "หร่อย"],           // 美味しい (ห引導を明示)
    "พลเมือง": ["พล", "ล", "เมือง"],    // 市民 (Overlap)

    // 2. その他の頻出例外単語 (Aksorn Nam, Overlap, Silent letters)
    "ตลาด": ["ต", "หลาด"],
    "ตลก": ["ต", "หลก"],
    "ฝรั่งเศส": ["ฝ", "หรั่ง", "เสด"],
    "เสมอ": ["ส", "เหมอ"],
    "สว่าง": ["ส", "หว่าง"],
    "ขยัน": ["ข", "หยัน"],
    "คุณภาพ": ["คุน", "นะ", "พาบ"],
    "สุขภาพ": ["สุก", "ขะ", "พาบ"],
    "รัฐบาล": ["รัด", "ถะ", "บาน"],
    "ศาสนา": ["สาด", "ส", "หนา"],
    "วัฒนธรรม": ["วัด", "ถะ", "นะ", "ทำ"],
    "เศรษฐกิจ": ["เสด", "ถะ", "กิด"],
    "ประสบการณ์": ["ประ", "สบ", "กาน"],
    "ประวัติศาสตร์": ["ประ", "หวัด", "ติ", "สาด"],
    "สามารถ": ["สา", "มาด"],
    "ธรรมชาติ": ["ทำ", "ม", "ชาด"],
    "จริง": ["จิง"],
    "บริษัท": ["บอ", "ริ", "สัด"],
    "ทราบ": ["ซาบ"],
    "กระทรวง": ["กระ", "ซวง"]
  };

  // 2. シートから全データを取得
  const range = sheet.getDataRange();
  const values = range.getValues(); // 2次元配列 [行][列]
  const header = values[0];
  
  // 列インデックスの特定 (id, word_th, custom_split)
  const wordColIdx = header.indexOf("word_th");
  const splitColIdx = header.indexOf("custom_split");

  if (wordColIdx === -1 || splitColIdx === -1) {
    throw new Error("ヘッダーに 'word_th' または 'custom_split' が見つかりません。");
  }

  // 3. 全行を走査してアップデート
  let updateCount = 0;
  for (let i = 1; i < values.length; i++) {
    const wordTh = values[i][wordColIdx];
    
    // マスタに単語があれば custom_split を更新
    if (masterDict[wordTh]) {
      // スプレッドシートには JSON文字列形式で保存
      values[i][splitColIdx] = JSON.stringify(masterDict[wordTh]);
      updateCount++;
    }
  }

  // 4. まとめてシートに書き戻し（高速）
  range.setValues(values);
  
  console.log(`完了: ${updateCount}件の単語をアップデートしました。`);
}