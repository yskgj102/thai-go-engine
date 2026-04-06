/**
 * DB全件スキャン：ロジックが敗北している（警告が出る）未修正単語を抽出する
 */
function auditThaiDatabaseFull() {
  const allVocab = getRawVocabulary(); // db_access.gs の関数
  
  if (!allVocab || allVocab.length === 0) {
    console.error("🚨 データが取得できませんでした。");
    return;
  }

  console.log(`=== 🕵️ 全件ロジック監査開始 (合計: ${allVocab.length}件) ===`);
  
  let warningList = [];
  let dictCount = 0;
  let successCount = 0;

  allVocab.forEach((item) => {
    const word = item.word_th;
    if (!word) return;

    try {
      // 解析実行（既存の辞書設定も含めてチェック）
      const syllables = GS_Parser.parseSyllables(word, item);
      const meta = syllables.meta || { isDict: false, isReliable: true, warnings: [] };

      if (meta.isDict) {
        // すでに辞書で修正済みのものはカウントのみ
        dictCount++;
      } else if (!meta.isReliable) {
        // ロジックで警告が出ており、かつ辞書未登録の「地雷単語」
        warningList.push({
          単語: word,
          意味: item.meaning || "不明",
          警告内容: meta.warnings.join(' | '),
          導出发音: meta.derivedPhonetic || ""
        });
      } else {
        // ロジックだけで完璧に解析できているもの
        successCount++;
      }
    } catch (e) {
      console.error(`❌ 解析エラー [${word}]: ${e.message}`);
    }
  });

  // --- 結果出力 ---
  if (warningList.length > 0) {
    console.warn(`🚨 修正が必要な単語が ${warningList.length} 件見つかりました：`);
    // 表形式で出力（GASのログで見やすい）
    warningList.forEach((res, i) => {
      console.log(`${i + 1}. 【${res.単語}】(${res.意味}) \n   └ ⚠️理由: ${res.警告内容} \n   └ 🔊推定: ${res.導出发音}`);
    });
  } else {
    console.log("✅ 素晴らしい！全単語がロジックまたは辞書で正しく解析されています。");
  }

  console.log("--- 🏁 最終レポート ---");
  console.log(`📊 正常解析: ${successCount}件`);
  console.log(`📖 辞書適用: ${dictCount}件`);
  console.log(`🚨 要修正　: ${warningList.length}件`);
  console.log("========================================");
}
/**
 * DBからランダムに数件ピックアップしてロジックテストを実行
 * @param {number} sampleSize - テストしたい件数（デフォルト20件）
 */
function runThaiDbTestRandom(sampleSize = 20) {
  console.log(`=== 🎲 THAI DB RANDOM TEST START (n=${sampleSize}) ===`);

  // 1. 全データを取得（db_access.gs の関数を使用）
  const allVocab = getRawVocabulary();
  
  if (!allVocab || allVocab.length === 0) {
    console.error("🚨 データが空です。'm_vocabulary' シートを確認してください。");
    return;
  }

  // 2. 配列をシャッフルして指定件数を抽出
  const shuffled = allVocab.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, sampleSize);

  console.log(`Picking ${selected.length} random samples from total ${allVocab.length} words...`);

  selected.forEach((item, index) => {
    const word = item.word_th;
    if (!word) return;

    try {
      // 3. 解析実行（DBエントリを渡すことで custom_split を反映）
      const syllables = GS_Parser.parseSyllables(word, item);
      const meta = syllables.meta || { isDict: false, isReliable: true, warnings: [] };
      
      // バッジと出力用ラベル
      const statusBadge = meta.isDict ? " [📖辞書]" : (meta.isReliable ? "" : " [⚠️警告]");
      
      const details = syllables.map((syl) => {
        const tInfo = ThaiMasterData.toneMap[syl.toneNum] || { label: '不明' };
        const toneLabel = tInfo.label[0]; 
        const classInit = syl.finalClass ? syl.finalClass[0] : '?';
        const typeInit = (syl.sType || 'D')[0];

        return `[${syl.full}: ${syl.vSound || '?'}/${classInit}/${typeInit} -> ${toneLabel}]`;
      });

      console.log(`${String(index + 1).padStart(2, '0')}. 【${word}】${statusBadge} -> ${details.join(' | ')}`);

      // 警告がある場合のみ詳細を表示
      if (!meta.isReliable && meta.warnings.length > 0) {
         console.log(`    └─ 💡理由: ${meta.warnings.join(', ')}`);
      }

    } catch (e) {
      console.error(`❌ 【${word}】 ERROR: ${e.message}`);
    }
  });

  console.log("=== 🏁 RANDOM TEST COMPLETE ===");
}


/**
 * GAS実行用：この関数を選択して実行ボタンを押せ
 */
function runThaiFinalTest() {
  const testWords = [
    // --- 1. 記号・異常系 (1文字・連続記号) ---
    "ๆ",         // 反復記号：子音がない場合に落ちないか
    "ฯ",         // 省略記号
    "๑๒๓",       // タイ数字：子音判定をすり抜けて無限ループしないか
    " ",         // 半角スペース
    "test",      // 英字混在：タイ語以外が入った時の挙動
    "รรร",       // Ro Han 連続：[ร][รร] になるべきネタ枠
    
    // --- 2. 二重機能子音 (Overlap) ★例外辞書のテスト★ ---
    "ผลไม้",     // 辞書で [ผล][ล][ไม้] に強制分割されるか
    "ขรุขระ",    // 辞書で [ขรุ][ขระ] に強制分割されるか
    "สรรพคุณ",   // 辞書で [สรรพ][พ][คุณ] に強制分割されるか

    // --- 3. 特殊文字 ฤ (Rue) の位置 ---
    "พฤษภาคม",   // [พฺรึด][สะ][ภา][คม] : 5月。ฤ が中間に。
    "ทฤษฎี",      // [ทฺริด][สะ][ดี] : 理論。
    "อังกฤษ",    // [อัง][กฺริด] : 英語。
    
    // --- 4. 黙字記号(์)の道連れ・最終形態 ---
    "กษัตริย์",   // [กะ][サット][リ] : r-i-y-์ 3文字道連れ
    "พระลักษณ์", // [พฺระ][ลัก] : s-n-th-r-์ 4文字道連れ
    "สิทธิ์",     // [สิด] : t-th-i-์  (権利)
    "พันธุ์",     // [พัน] : th-u-์ (種) 下の母音も道連れにできるか
    
    // --- 5. 長音・短音・声調の渋滞 ---
    "เดี๋ยว",     // [เดี่ยว] : すでに通ったが再確認
    "น้ำ",        // [ナム] : 短母音 am + 声調記号
    "เก้าอี้",    // [เก้า][อี้] : 椅子。ao + ii
    
    // --- 6. 地名・外来語 ---
    "กรุงเทพฯ",   // [กฺรุง][เท็บ] : バンコク。省略記号付き
    "อินเทอร์เน็ต",// [อิน][เทอร์][เน็ต] : インターネット。
    "คอร์รัปชัน",   // [คอร์][รัป][ชัน] : 腐敗(Corruption)。

    // --- 7. 手動追加 ---
    "คนโง่",     
    "สนุก",      
    "ทำไม",      
    "อร่อย",     

    // --- 8. 【追加】自己診断（警告）のテスト ---
    "พลเมือง"    // 市民(phon-la-mueang) : 辞書に未登録のOverlap。警告が出るかテスト
  ];

  console.log("=== THAI LOGIC DEBUG START (V6.3 Hybrid) ===");

  testWords.forEach(word => {
    try {
  const mockDb = {
        "ผลไม้": { custom_split: '["ผล","ล","ไม้"]' },
        "ขรุขระ": { custom_split: '["ขรุ","ขระ"]' },
        "สรรพคุณ": { custom_split: '["สรรพ","พ","คุณ"]' },
        "อร่อย": { custom_split: '["อ","หร่อย"]' }
      };

      const dbEntry = mockDb[word] || null;

      // 2. Parserを叩く（第2引数に dbEntry を渡す！）
      const syllables = GS_Parser.parseSyllables(word, dbEntry);
      
      // ★追加：メタデータ(meta)から、辞書使用や警告の状況を取得してバッジ化
      let statusBadge = "";
      if (syllables.meta && syllables.meta.isDict) {
          statusBadge = " [📖辞書]";
      } else if (syllables.meta && !syllables.meta.isReliable) {
          statusBadge = " [⚠️警告]";
      }

      let logOutput = `【${word}】${statusBadge} -> `;

      // 2. Parserが算出した結果を文字起こし
      const details = syllables.map((syl) => {
        const toneLabels = ["平", "低", "下", "高", "上"];
        const toneLabel = toneLabels[syl.toneNum] || "？";
        
        return `[${syl.full}: ${syl.vSound || '?'}/${syl.finalClass ? syl.finalClass[0] : '?'}/${(syl.sType || 'D')[0]} -> ${toneLabel}]`;
      });

      console.log(logOutput + details.join(' | '));

      // ★追加：警告がある場合は、次の行に具体的な理由を出力する
      if (syllables.meta && !syllables.meta.isReliable) {
         console.log(`   └─ 診断詳細: ${syllables.meta.warnings.join(', ')}`);
      }

    } catch (e) {
      console.error(`【${word}】 ERROR: ${e.message}`);
    }
  });

  console.log("=== THAI LOGIC DEBUG END ===");
}
/**
 * GS_Parser: 音節構造解析エンジン (V6.3 Hybrid 完全版)
 * 役割: 入力された文字列をタイ語の文法規則に従って音節(Syllable)に切り分け、
 * 最後にValidatorを呼び出して声調を確定させる。
 */
const GS_Parser = {

  // --- ★新機能1：例外オーバーライド辞書 ---
  // ルールベース(Greedy Loop)では構造上どうしても誤分割される単語
  // （例：二重機能子音/Overlap）を強制的に正しい音節配列に切り分ける。

  // --- メインルーター（外部から呼ばれるのはここだけ） ---
/**
   * メインルーター：DBエントリを優先的にチェックする
   * @param {string} text - 解析するタイ語
   * @param {Object} dbEntry - スプレッドシートから取得した1行分のデータ(任意)
   */
parseSyllables: function(text, dbEntry = null) {
    if (!text) return [];

    // 1. DB(シート)に custom_split があればそれを使う
    if (dbEntry && dbEntry.custom_split) {
      try {
        const chunks = typeof dbEntry.custom_split === 'string' 
                       ? JSON.parse(dbEntry.custom_split) 
                       : dbEntry.custom_split;
        
        let combinedSyllables = [];
        chunks.forEach(chunk => {
           // ★ 修正：パーツを解析するが、必ず1つの音節に強制マージする
           const parsed = this._parseCore(chunk);
           if (parsed.length > 0) {
             const atomicSyllable = parsed[0];
             
             // もしエンジンが勝手に複数に分けた場合、1つに統合する
             if (parsed.length > 1) {
               atomicSyllable.full = chunk; // 表示を元のチャンクに戻す
               
               // 最後のパーツから末子音（lastC）の情報を継承
               const lastPart = parsed[parsed.length - 1];
               atomicSyllable.lastC = lastPart.lastC || lastPart.mainC;
               
               // バラバラにされた記号や文字をすべて marks に統合（声調計算用）
               for(let k = 1; k < parsed.length; k++) {
                 atomicSyllable.marks = atomicSyllable.marks.concat(
                    Array.from(parsed[k].mainC), 
                    parsed[k].marks
                 );
               }
             }
             combinedSyllables.push(atomicSyllable);
           }
        });
        
        // 辞書適用時は強制的に「信頼(Reliable)」フラグを立て、警告を封じる
        combinedSyllables.meta = { isDict: true, isReliable: true, warnings: [] };
        return this.resolveLogic(combinedSyllables);
      } catch (e) {
        console.error("Custom split process error:", e);
      }
    }

    // 2. なければ自動解析
    const syllables = this._parseCore(text);
    return this.resolveLogic(syllables);
  },

  // --- コア解析エンジン（文字を左から舐めて吸い込む） ---
  _parseCore: function(text) {
    const vMarks = "ะาิีึืุูัำ็"; // ★ '็' を追加
    const leadingV = "เแโใไ";
    const toneMarks = "่้๊๋์";
    const chars = Array.from(text);
    const syllables = [];
    let i = 0;

    while (i < chars.length) {
      let syl = { full: '', leadingV: '', mainC: '', marks: [], lastC: '', isRoHan: false };

// ★追加：逆転パターンの先読み (例: แมลง -> [ม] + [แลง])
      // 1文字目が子音で、2文字目が前置母音(เแโใไ)の場合、1文字目を独立させる
      if (i + 1 < chars.length && 
          leadingV.indexOf(chars[i]) === -1 && 
          leadingV.indexOf(chars[i+1]) !== -1) {
        syl.mainC = chars[i]; syl.full = chars[i]; i++;
        syllables.push(syl);
        continue; // 次のループ（前置母音の処理）へ
      }
      // Step 1. 前置母音 (เแโใไ) の回収
      if (i < chars.length && leadingV.indexOf(chars[i]) !== -1) {
        syl.leadingV = chars[i]; syl.full += chars[i]; i++;
      }
// Step 2. 核子音の回収 (マスタによるクラスタ・ห引導・ฤ の処理)
      if (i < chars.length) {
        const c1 = chars[i];
        const c2 = chars[i+1];
        const nextMark = chars[i+2]; // 3文字目（รร判定用）
        const combo = c1 + c2;

        // 1. 二重子音マスタ (ThaiMasterData.clusters) にあるかチェック
        // 例: 'ตร' がマスタにあれば、2文字まとめて mainC に入れる
        if (c2 && ThaiMasterData.clusters[combo]) {
          // ★重要: c2が 'ร' で次も 'ร' (รร) なら Ro Han 優先のため、ここでは吸わない
          if (c2 === 'ร' && nextMark === 'ร') {
            syl.mainC = c1; syl.full += c1; i++;
          } else {
            syl.mainC = combo; syl.full += combo; i += 2;
          }
        } 
        // 2. 引導子音 (ห + 低級単独子音) の判定
        else if (c1 === 'ห' && c2 && "งญนมรลวยว".indexOf(c2) !== -1) {
          syl.mainC = combo; syl.full += combo; i += 2;
        } 
        // 3. ฤ (Rue) または 単独子音
        else {
          syl.mainC = c1; syl.full += c1; i++;
        }
      }

      // Step 3. Ro Han (รร) の物理検知
      if (i + 1 < chars.length && chars[i] === 'ร' && chars[i+1] === 'ร') {
        const next = chars[i+2];
        // 次の文字が母音記号でない場合のみ Ro Han として扱う
        if (!next || (vMarks.indexOf(next) === -1 && leadingV.indexOf(next) === -1)) {
          syl.isRoHan = true; syl.marks.push('รร'); syl.full += 'รร'; i += 2;
        }
      }

// Step 4. 母音記号と「母音として機能する子音」の回収
      while (i < chars.length) {
        const c = chars[i];
        const next = chars[i+1];
        
        if (next === '์') break;

        // A. 明らかな記号類
        if (vMarks.indexOf(c) !== -1 || toneMarks.indexOf(c) !== -1 || c === '์') {
          syl.marks.push(c); syl.full += c; i++;
          continue;
        }

        // B. 子音兼母音 (ย, ว, อ) の判定強化
        // 前置母音がない場合でも、これらが「核」になるケースを救済
        const hasMainVowel = syl.marks.some(m => vMarks.indexOf(m) !== -1);
        const isVowelPart = 
          (c === 'ย' && (syl.leadingV === 'เ' || hasMainVowel)) || 
          (c === 'ว' && (syl.marks.includes('ั') || !hasMainVowel)) || // -ัว または 単独の ว
          (c === 'อ' && !hasMainVowel); // 単独の อ (ของ 等)

        if (isVowelPart) {
          syl.marks.push(c); syl.full += c; i++;
          continue;
        }
        break;
      }

      // Step 5. 末子音と、それに連なる黙字(์)セットの回収
// --- Step 5. 末子音の回収（先読みロジック搭載） ---
      while (i < chars.length) {
        const c = chars[i];
        const next = chars[i+1];
        const afterNext = chars[i+2]; // ★一歩先を見る

        // A. 次が前置母音なら、今の文字は確実に次音節の頭子音
        if (leadingV.indexOf(c) !== -1) break;

        // B. 【重要】先読みブレーキ
        // 今の文字(c)を末子音として飲み込む前に、次(next)が「母音を伴った頭文字」かチェック
        if (next) {
          const nextHasVowel = (vMarks.indexOf(next) !== -1 || toneMarks.indexOf(next) !== -1 || leadingV.indexOf(next) !== -1);
          const afterNextHasVowel = afterNext && (vMarks.indexOf(afterNext) !== -1 || toneMarks.indexOf(afterNext) !== -1);
          
          // 次の文字が母音を持っている、あるいは「次＋その次」が「子音＋母音」のセットなら
          // 今の文字(c)は末子音ではなく、次音節の頭文字（またはその一部）である可能性が高い
          if (nextHasVowel && next !== '์') break; 
          if (afterNextHasVowel) break; // これで ช-นะ (cha-na) を守る
        }

        // C. 条件をクリアした文字を末子音(lastC)として吸い込む
        syl.lastC = c; 
        syl.full += c; 
        i++;

        // 直後の ์ (黙字) 等の付随記号を回収
        while (i < chars.length && (vMarks.indexOf(chars[i]) !== -1 || toneMarks.indexOf(chars[i]) !== -1 || chars[i] === '์')) {
          syl.marks.push(chars[i]); 
          syl.full += chars[i]; 
          i++;
        }
        break; // 末子音は1つまで
      }
      
      syllables.push(syl);
    }
    return syllables;
  },

  // --- 解析結果を元に、声調や属性を確定させるロジック ---
  resolveLogic: function(syllables) {
    const lowSingles = "งนมยรลวยญณฬ";
    
    // パス1: クラス判定と声調計算
    syllables.forEach((syl, i) => {
        const headChar = syl.mainC[0];
        const cObj = ThaiMasterData.consonants[headChar] || { class: '不明' };
        
        syl.finalClass = cObj.class;
        syl.isOverridden = false;
        syl.ruleLabel = "標準";

        // 属性伝染・引導子音(ห/อ)の判定
        if (syl.mainC.startsWith('ห') && syl.mainC.length > 1) {
            syl.finalClass = 'High'; syl.isOverridden = true; syl.ruleLabel = "ห引導";
        } else if (i > 0) {
            const prev = syllables[i-1];
            const isPrevOpenA = (!prev.lastC && !prev.leadingV && prev.marks.length === 0) || prev.isRoHan;

            if ((prev.finalClass === 'High' || prev.finalClass === 'Mid') && 
                isPrevOpenA && 
                syl.finalClass === 'Low' && 
                lowSingles.indexOf(headChar) !== -1) {
                syl.finalClass = prev.finalClass;
                syl.isOverridden = true;
                syl.ruleLabel = "属性伝染";
            }
        }

        // Validatorを呼んで母音と基本タイプを取得
        const vRule = GS_Validator.resolveVowel(syl);
        const tMark = syl.marks.find(m => /[\u0E48-\u0E4B]/.test(m));
        let sType = syl.lastC ? (ThaiMasterData.terminalGroups[syl.lastC] || 'Dead') : vRule.type;
        
        // ★ Ro Han (รร) の死音化ロジック
        // Parserで配列として後ろに要素(音節)が存在する場合、促音(Dead)扱いにする
        if (syl.isRoHan && i + 1 < syllables.length) {
            sType = 'Dead';
            syl.ruleLabel = "RoHan(閉)";
        }

syl.toneNum = GS_Validator.getToneNumber(syl.finalClass, tMark, sType, vRule.length);
        syl.sType = sType;
        syl.vSound = vRule.sound; 
if (syl.isRoHan) {
    syl.vSound = 'a';
}
        syl.vLen = vRule.length;

        // --- 🔊 【ロジック層での発音記号導出】 ---
// --- 🔊 【ロジック層での発音記号導出】 ---
        const tObj = ThaiMasterData.toneMap[syl.toneNum] || { mark: "" };
        
        let baseSound = "";
        const headStr = syl.mainC;

        // 1. マスタ(clusters)を最優先で引く（'ตร' -> 'tr'）
        if (ThaiMasterData.clusters[headStr]) {
            baseSound = ThaiMasterData.clusters[headStr].sound;
        } 
        // 2. 引導子音(ห/อ)の場合は2文字目を採用 (既存ロジック)
        else if (headStr.length > 1 && (headStr[0] === 'ห' || headStr[0] === 'อ')) {
            baseSound = ThaiMasterData.consonants[headStr[1]]?.sound || "";
        } 
        // 3. 通常の単独子音
        else {
            baseSound = ThaiMasterData.consonants[headStr[0]]?.sound || "";
        }

        syl.pInitial = baseSound.toLowerCase();

        // 4. 全体発音の組み立て（母音の直後に声調記号を置く [ sà-nùk ] 形式）
        const pVowel = (syl.vSound || "").toLowerCase();
        const pFinalClean = (syl.lastC) ? (ThaiMasterData.consonants[syl.lastC]?.final || "").toLowerCase() : "";
        
        syl.derived = syl.pInitial + pVowel + tObj.mark + pFinalClean;
        
    });

// --- パス2：自己診断（確信度チェック）強化版 ---
let hasWarning = false;
let warningReasons = [];
const isDictApplied = syllables.meta ? syllables.meta.isDict : false;

syllables.forEach((syl, i) => {
    syl.confidence = "HIGH";
    
    if ("ๆฯ".indexOf(syl.mainC) !== -1) return;

    // A. 文字自体の不明チェック
    if (syl.finalClass === '不明') {
        syl.confidence = "LOW";
        warningReasons.push(`[${syl.full}]: 不明な文字が含まれています`);
    }

    // B. 裸の子音（記号も母音も末子音もない）のチェック
    const isNaked = !syl.leadingV && syl.marks.length === 0 && !syl.lastC && !syl.isRoHan && syl.mainC.length === 1;
    
    if (!isDictApplied && isNaked) {
        if (i === syllables.length - 1) {
            // 末尾の場合：既存の末子音分離チェック
            const isLikelyFinalC = "งนมยรลวยกบด".indexOf(syl.mainC) !== -1;
            if (isLikelyFinalC && i > 0 && (syllables[i-1].marks.length > 0 || syllables[i-1].leadingV)) {
                syl.confidence = "LOW";
                warningReasons.push(`[${syl.full}]: 末子音の分離（解析ミス）の疑い`);
            }
        } else {
            // ★強化ポイント：音節の途中に裸の子音がある場合
            // 本来の「暗黙a」か「解析ミス（吸着漏れ）」か判別不能なため、あえて「LOW」にして警告を出す
            syl.confidence = "LOW";
            warningReasons.push(`[${syl.full}]: 音節中央の単独子音（末子音吸着漏れ、またはOverlapの疑い）`);
        }
    }
    
    if (syl.confidence === "LOW") hasWarning = true;
});

    // メタデータとして診断結果と「完成済み発音記号」を付与
    syllables.meta = {
        isReliable: !hasWarning,
        warnings: warningReasons,
        isDict: isDictApplied,
        derivedPhonetic: syllables.map(s => s.derived).join("-") // ここで連結
    };
// --- 🛡️ パス3：正直なリカバリー・レイヤー (中間吸着 & 履歴残し) ---
    if (!isDictApplied && syllables.length >= 2) {
        let recoveryHappened = false;
        let history = [];

        for (let j = syllables.length - 1; j >= 1; j--) {
            let current = syllables[j];
            let prev = syllables[j - 1];

            // 判定条件：現在が「裸の子音」かつ「前の音節に母音がある」場合
            const isOrphan = !current.leadingV && current.marks.length === 0 && !current.lastC && current.mainC.length === 1;
            const prevHasVowel = prev.marks.length > 0 || prev.leadingV || prev.isRoHan;

            if (isOrphan && prevHasVowel) {
                const beforeStr = `${prev.full}-${current.full}`;
                
                // 1. 強制吸着
                prev.lastC = current.mainC;
                prev.full += current.mainC;
                
                // 2. 再計算
                const recV = GS_Validator.resolveVowel(prev);
                prev.sType = prev.lastC ? (ThaiMasterData.terminalGroups[prev.lastC] || 'Dead') : recV.type;
                const tMark = prev.marks.find(m => /[\u0E48-\u0E4B]/.test(m));
                prev.toneNum = GS_Validator.getToneNumber(prev.finalClass, tMark, prev.sType, recV.length);
                
                // 3. 発音記号(derived)の再生成
                const tObj = ThaiMasterData.toneMap[prev.toneNum] || { mark: "" };
                const pHead = (prev.mainC.length > 1 && (prev.mainC[0] === 'ห' || prev.mainC[0] === 'อ')) ? prev.mainC[1] : prev.mainC[0];
                const pInit = (ThaiMasterData.consonants[pHead]?.sound || "").toLowerCase();
                const pFinal = (ThaiMasterData.consonants[prev.lastC]?.final || "").toLowerCase();
                prev.derived = pInit + (recV.sound || "").toLowerCase() + tObj.mark + pFinal;
                // 4. 履歴を記録して削除
                history.push(`[${beforeStr} → ${prev.full}]`);
                syllables.splice(j, 1);
                recoveryHappened = true;
            }
            
        }
        
  if (recoveryHappened) {
            // ★ 足したこと：確信度の塗り替え
            // 吸着に成功した音節については、最低限の体裁は整ったので "MID" に格上げする
            syllables.forEach(s => {
                if (s.confidence === "LOW") {
                    s.confidence = "MID"; // 赤から黄色へ
                }
            });

            // メタデータの更新
            syllables.meta.isReliable = false; // 依然として「100%確実」ではないので false を維持
            syllables.meta.warnings = [
                `🛠️ 吸着リカバリー実行: ${history.join(', ')}`,
                // warningReasons は「吸着前の状態」の警告なので、ここではあえて含めず履歴を優先する
            ];
            syllables.meta.derivedPhonetic = syllables.map(s => s.derived).join("-");
        }

    }

    return syllables;
  }
};
/**
 * GS_Validator: 判定ロジック (タイ語声調・母音解析エンジン)
 * * 役割: Parserが切り出した音節(syl)に対し、マスタデータと例外ルールを
 * 適用して「最終的な母音」「生死(Live/Dead)」「声調番号」を確定させる。
 */
const GS_Validator = {
  
  resolveVowel: function(syl) {
    // デバッグ用: マスタに照合する直前の「ベース文字列」と「末子音」を出力
    console.log(`DEBUG: [${syl.full}] mainC: "${(syl.mainC || '') + syl.marks.filter(m => !/[่้๊๋์]/.test(m)).join('')}" lastC: "${syl.lastC}"`);
    
    // --- 0. Ro Han (รร) の強制割り込み処理 ---
    // Parserのフラグ漏れを防ぐため、文字面に 'รร' が含まれているかを物理検知する
    const isRoHanChar = syl.full.indexOf('รร') !== -1;

    if (isRoHanChar) {
      return { 
        sound: 'a', // Ro Han はデフォルトで短母音の 'a' を持つ
        length: 'short', 
        // Parser側 (resolveLogic) で「後ろに子音が続くから死音(Dead)」と
        // 判定されている場合はそれに従い、それ以外は生音(Live)とする
        type: (syl.sType === 'Dead') ? 'dead' : 'live' 
      };
    }

    // --- 1. マスタ照合用の純粋なベース文字列を作成 ---
    // 声調記号(่้๊๋)と黙字記号(์)を徹底除去して、母音だけの構成にする
    const pure = syl.marks.filter(m => !/[่้๊๋์]/.test(m)).join('');
    const base = (syl.leadingV || '') + pure;
    
    // マスタ側の symbols (例: 'เ-ีย') からハイフン等を除去して比較可能にする関数
    const normalize = (str) => str.replace(/[-\s]/g, '');

    // --- 2. マスタ照合（最長一致の原則） ---
    // A: 記号 + 末子音 (เดี๋ยว のように 'ย' や 'ว' が母音に組み込まれるパターンを優先)
    const withLast = base + (syl.lastC || '');
    
    // 優先度1: 末子音を含めた形でマスタに存在するか
    // 優先度2: 母音記号のみでマスタに存在するか
    let rule = ThaiMasterData.vowelRules.find(r => normalize(r.symbols) === withLast) ||
               ThaiMasterData.vowelRules.find(r => normalize(r.symbols) === base);

    if (rule) {
      // 母音の一部として 'ย' や 'ว' が食われた場合（例: เีย + ว）
      // これを末子音として二重計算しないようフラグを立てる
      if (normalize(rule.symbols).endsWith(syl.lastC)) {
        syl.isVowelPart = true; 
      }
      return rule;
    }

    // --- 3. 最終フォールバック (マスタにない場合の推測) ---
    // 記号が何もなく、末子音だけがある場合 (例: คน の ค + น) は暗黙の短母音 'o'
    if (syl.lastC && !syl.isVowelPart) {
      return { sound: 'o', length: 'short', type: 'live' };
    }
    
    // 末子音すらなく、記号もない単独子音 (例: ะ が省略された形など) は暗黙の短母音 'a'
    return { sound: 'a', length: 'short', type: 'dead' };
  },

  /**
   * 声調計算ロジック (タイ語の絶対ルールに基づく)
   * 戻り値: 0(平), 1(低), 2(下), 3(高), 4(上)
   */
  getToneNumber: function(charClass, tMark, sType, vLength) {
    const vLen = (vLength || 'short').toLowerCase();
    
    // --- ルール1: 声調記号がある場合（最優先） ---
    // 子音のクラス（低級か、中/高級か）によって記号の意味が変わる
    if (tMark) {
        if (tMark === '่') return (charClass === 'Low') ? 2 : 1; // ่ : 低級なら下声(2)、他は低声(1)
        if (tMark === '้') return (charClass === 'Low') ? 3 : 2; // ้ : 低級なら高声(3)、他は下声(2)
        if (tMark === '๊') return 3;                            // ๊ : 常に高声(3) ※主に中級で使用
        if (tMark === '๋') return 4;                            // ๋ : 常に上声(4) ※主に中級で使用
    }

    // --- ルール2: 無記号・生音 (Live Sound) ---
    // 長母音で終わる、または末子音が生音(ง,น,ม,ย,ว)の場合
    if (sType.toLowerCase() === 'live') {
        // 高級子音なら上声(4)、中級・低級なら平声(0)
        return (charClass === 'High') ? 4 : 0; 
    }

    // --- ルール3: 無記号・死音 (Dead Sound) の 中級・高級 ---
    // 短母音で終わる、または末子音が死音(ก,ด,บ)の場合
    if (charClass === 'High' || charClass === 'Mid') {
        return 1; // 長さに関係なく一律で「低声(1)」
    }

    // --- ルール4: 無記号・死音 (Dead Sound) の 低級 ---
    // 低級子音の死音だけは、母音の長さで声調が分岐する
    // 短母音なら「高声(3)」、長母音なら「下声(2)」
    return (vLen === 'short') ? 3 : 2;
  }



};
const ThaiMasterData = {
 consonants: {
    // --- K-group (末尾だと 'k' になるグループ) ---
    'ก': { class: 'Mid',  name: 'Ko Kai',      sound: 'k',  final: 'k' },
    'ข': { class: 'High', name: 'Kho Khai',    sound: 'kh', final: 'k' },
    'ฃ': { class: 'High', name: 'Kho Khuat',   sound: 'kh', final: 'k' }, // 現在は使われない
    'ค': { class: 'Low',  name: 'Kho Khwai',   sound: 'kh', final: 'k' },
    'ฅ': { class: 'Low',  name: 'Kho Khon',    sound: 'kh', final: 'k' }, // 現在は使われない
    'ฆ': { class: 'Low',  name: 'Kho Rakhang', sound: 'kh', final: 'k' },

    // --- T-group (末尾だと 't' になるグループ) ---
    'จ': { class: 'Mid',  name: 'Cho Chan',     sound: 'ch', final: 't' },
    'ฉ': { class: 'High', name: 'Cho Ching',    sound: 'ch', final: 't' },
    'ช': { class: 'Low',  name: 'Cho Chang',    sound: 'ch', final: 't' },
    'ซ': { class: 'Low',  name: 'So So',        sound: 's',  final: 't' },
    'ฌ': { class: 'Low',  name: 'Cho Choe',     sound: 'ch', final: 't' },
    'ฎ': { class: 'Mid',  name: 'Do Chada',     sound: 'd',  final: 't' },
    'ฏ': { class: 'Mid',  name: 'To Patak',     sound: 't',  final: 't' },
    'ฐ': { class: 'High', name: 'Tho Than',     sound: 'th', final: 't' },
    'ฑ': { class: 'Low',  name: 'Tho Montho',   sound: 'th', final: 't' },
    'ฒ': { class: 'Low',  name: 'Tho Phuthao',  sound: 'th', final: 't' },
    'ด': { class: 'Mid',  name: 'Do Dek',       sound: 'd',  final: 't' },
    'ต': { class: 'Mid',  name: 'To Tao',       sound: 't',  final: 't' },
    'ถ': { class: 'High', name: 'Tho Thung',    sound: 'th', final: 't' },
    'ท': { class: 'Low',  name: 'Tho Thahaan',  sound: 'th', final: 't' },
    'ธ': { class: 'Low',  name: 'Tho Thong',    sound: 'th', final: 't' },
    'ศ': { class: 'High', name: 'So Sala',      sound: 's',  final: 't' },
    'ษ': { class: 'High', name: 'So Ruesi',     sound: 's',  final: 't' },
    'ส': { class: 'High', name: 'So Suea',      sound: 's',  final: 't' },

    // --- P-group (末尾だと 'p' になるグループ) ---
    'บ': { class: 'Mid',  name: 'Bo Baimai',    sound: 'b',  final: 'p' },
    'ป': { class: 'Mid',  name: 'Po Plaa',      sound: 'p',  final: 'p' },
    'ผ': { class: 'High', name: 'Pho Phueng',   sound: 'ph', final: 'p' },
    'ฝ': { class: 'High', name: 'Fo Fa',        sound: 'f',  final: 'p' },
    'พ': { class: 'Low',  name: 'Pho Phan',     sound: 'ph', final: 'p' },
    'ฟ': { class: 'Low',  name: 'Fo Fan',       sound: 'f',  final: 'p' },
    'ภ': { class: 'Low',  name: 'Pho Samphao',  sound: 'ph', final: 'p' },

    // --- N-group (末尾だと 'n' になるグループ) ---
    'ญ': { class: 'Low',  name: 'Yo Ying',      sound: 'y',  final: 'n' },
    'ณ': { class: 'Low',  name: 'No Nen',       sound: 'n',  final: 'n' },
    'น': { class: 'Low',  name: 'No Nuu',       sound: 'n',  final: 'n' },
    'ร': { class: 'Low',  name: 'Ro Ruea',      sound: 'r',  final: 'n' },
    'ล': { class: 'Low',  name: 'Lo Ling',      sound: 'l',  final: 'n' },
    'ฬ': { class: 'Low',  name: 'Lo Chula',     sound: 'l',  final: 'n' },

    // --- Nasal / Semi-vowel (末尾もそのまま) ---
    'ง': { class: 'Low',  name: 'Ngo Nguu',     sound: 'ng', final: 'ng' },
    'ม': { class: 'Low',  name: 'Mo Maa',       sound: 'm',  final: 'm' },
    'ย': { class: 'Low',  name: 'Yo Yak',       sound: 'y',  final: 'y' },
    'ว': { class: 'Low',  name: 'Wo Waen',      sound: 'w',  final: 'w' },

    // --- その他（末尾にはならない文字） ---
    'ห': { class: 'High', name: 'Ho Hip',       sound: 'h',  final: '-' },
    'อ': { class: 'Mid',  name: 'O Ang',        sound: '-',  final: '-' },
    'ฮ': { class: 'Low',  name: 'Ho Nok-huk',   sound: 'h',  final: '-' },
    'ฤ': { class: 'Low',  name: 'Rue',          sound: 'rue', final: '-' },
'ฒ': { class: 'Low',  name: 'Tho Phuthao', sound: 'th', final: 't' }, 
'ฬ': { class: 'Low',  name: 'Lo Chula',    sound: 'l',  final: 'n' },
// これらは「文字」としてカウントされないように除外するか、
// 特殊な class: 'Symbol' として定義しておくと安全です
'ๆ': { class: 'Symbol', name: 'Mai Yamok', sound: '(repeat)', final: '-' }, // 繰り返し
'ฯ': { class: 'Symbol', name: 'Paiyan Noi', sound: '(etc)',    final: '-' }, // 省略

},
  // vowelRules に追加・上書き（最長一致のため、記号が多い順に並べること）
  vowelRules: [

    { symbols: 'เ็',  sound: 'e',   length: 'short', type: 'dead' },
{ symbols: 'แ็',  sound: 'ɛ',   length: 'short', type: 'dead' },
{ symbols: 'เิ',  sound: 'əə',  length: 'long',  type: 'live' },
    // vowelRules の最初に追加
    { symbols: 'เื',  sound: 'ɯa', length: 'long', type: 'live' },
{ symbols: 'เีย', sound: 'ia', length: 'long', type: 'live' },
{ symbols: 'เือ', sound: 'ɯa', length: 'long', type: 'live' },
{ symbols: 'ัว',  sound: 'ua', length: 'long', type: 'live' },
    // --- 3文字セット ---
    { symbols: 'เีย', sound: 'ia', length: 'long', type: 'live' }, // diaw (เดี๋ยว) 等
    
    // --- 2文字セット ---
    { symbols: 'เาะ', sound: 'ɔ',  length: 'short', type: 'dead' },
    { symbols: 'เิ',  sound: 'əə', length: 'long', type: 'live' },
    { symbols: 'เะ',  sound: 'e',   length: 'short', type: 'dead' },
    { symbols: 'แะ',  sound: 'ɛ',   length: 'short', type: 'dead' },
    { symbols: 'โะ',  sound: 'o',   length: 'short', type: 'dead' },
    { symbols: 'ัว',  sound: 'ua', length: 'long', type: 'live' }, // 末子音がない時の ua
    { symbols: 'เา',  sound: 'ao', length: 'long', type: 'live' },
    
    // --- 特殊母音（末子音ありで形が変わるもの） ---
    
    { symbols: 'ั',   sound: 'a',   length: 'short', type: 'dead' }, // c-a-c
    { symbols: 'ิ',   sound: 'i',   length: 'short', type: 'dead' },
    { symbols: 'ึ',   sound: 'ɯ',   length: 'short', type: 'dead' },
    { symbols: 'ุ',   sound: 'u',   length: 'short', type: 'dead' },
    { symbols: '็',   sound: 'e',   length: 'short', type: 'dead' }, // 短母音化記号 (เ-็)
    { symbols: 'ี',   sound: 'ii',  length: 'long',  type: 'live' },
    { symbols: 'ื',   sound: 'ɯɯ',  length: 'long',  type: 'live' },
    { symbols: 'ู',   sound: 'uu',  length: 'long',  type: 'live' },
    { symbols: 'เ',   sound: 'ee',  length: 'long',  type: 'live' },
    { symbols: 'แ',   sound: 'ɛɛ',  length: 'long',  type: 'live' },
    { symbols: 'โ',   sound: 'oo',  length: 'long',  type: 'live' },
    { symbols: 'อ',   sound: 'ɔɔ',  length: 'long',  type: 'live' },
    { symbols: 'า',   sound: 'aa',  length: 'long',  type: 'live' },
    { symbols: 'ำ',   sound: 'am',  length: 'short', type: 'live' },
    { symbols: 'ใ',   sound: 'ai',  length: 'short', type: 'live' },
    { symbols: 'ไ',   sound: 'ai',  length: 'short', type: 'live' },
    { symbols: 'ะ',   sound: 'a',   length: 'short', type: 'dead' }
  ],

  terminalGroups: {
    'ก': 'Dead', 'ข': 'Dead', 'ค': 'Dead', 'ฆ': 'Dead',
    'ง': 'Live', 'น': 'Live', 'ณ': 'Live', 'ญ': 'Live', 'ร': 'Live', 'ล': 'Live', 'ฬ': 'Live',
    'บ': 'Dead', 'ป': 'Dead', 'พ': 'Dead', 'ฟ': 'Dead', 'ภ': 'Dead',
    'ม': 'Live', 'ย': 'Live', 'ว': 'Live',
    'ด': 'Dead', 'ต': 'Dead', 'ถ': 'Dead', 'ท': 'Dead', 'ธ': 'Dead', 'ส': 'Dead', 'ศ': 'Dead', 'ษ': 'Dead'
  },

  toneMap: {
    0: { mark: '', label: '平声 (Common)', color: 'text-teal-600 dark:text-teal-400' }, 
    1: { mark: '̀', label: '低声 (Low)', color: 'text-red-500' },
    2: { mark: '̂', label: '下声 (Falling)', color: 'text-purple-500' },
    3: { mark: '́', label: '高声 (High)', color: 'text-sky-500' },
    4: { mark: '̌', label: '上声 (Rising)', color: 'text-amber-500' }
  },

  classColors: {
    'Low': 'text-blue-400',
    'Mid': 'text-green-400',
    'High': 'text-red-400',
    '不明': 'text-white/30'
  },
  clusters : {
// --- 伝統的なタイ語の二重子音 ---
    'กร': { sound: 'kr', class: 'Mid' }, 'กล': { sound: 'kl', class: 'Mid' }, 'กว': { sound: 'kw', class: 'Mid' },
    'ขร': { sound: 'khr', class: 'High' }, 'ขล': { sound: 'khl', class: 'High' }, 'ขว': { sound: 'khw', class: 'High' },
    'คร': { sound: 'khr', class: 'Low' }, 'คล': { sound: 'khl', class: 'Low' }, 'คว': { sound: 'khw', class: 'Low' },
    'ตร': { sound: 'tr', class: 'Mid' },
    'ปร': { sound: 'pr', class: 'Mid' }, 'ปล': { sound: 'pl', class: 'Mid' },
    'พร': { sound: 'phr', class: 'Low' }, 'พล': { sound: 'phl', class: 'Low' },
'ทร': { sound: 's', class: 'Low' }, // 擬似二重子音の代表格
    // --- 外来語（英語由来）対応：これを足すと完璧 ---
    'ฟร': { sound: 'fr', class: 'Low' }, // free
    'ฟล': { sound: 'fl', class: 'Low' }, // flute
    'บร': { sound: 'br', class: 'Mid' }, // brake
    'บล': { sound: 'bl', class: 'Mid' }, // blue
    'ดร': { sound: 'dr', class: 'Mid' }  // dream
}

};


