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
    
    // --- 2. 二重機能子音 (Overlap) ---
    // 前の音節の末子音でありつつ、自身の母音 'a' を持つ難問
    "ผลไม้",     // [ผล][ละ][ไม้] : ph-o-l | l-a | m-ai (果物)
    "ขรุขระ",    // [ขรุ][ขระ] : khru-khra (デコボコ) 二重子音の連続
    "สรรพคุณ",   // [สับ][พะ][คุน] : p が末子音(p)と次音節(pa)を兼ねる

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


        "คนโง่",   // 手動追加
        "สนุก",   // 手動追加
        "ทำไม",   // 手動追加
        "อร่อย",   // 手動追加
    
  ];
  console.log("=== THAI LOGIC DEBUG START ===");


  testWords.forEach(word => {
    try {
      // 1. Parserを叩く（ここですべての属性伝染・声調計算を完結させる）
      const syllables = GS_Parser.parseSyllables(word);
      let logOutput = `【${word}】 -> `;

      // 2. Parserが算出した「syl」オブジェクトの結果を、ただ文字にするだけ
      const details = syllables.map((syl) => {
        // Parserが計算してくれた 0-4 の番号をラベルに変換
        const toneLabels = ["平", "低", "下", "高", "上"];
        const toneLabel = toneLabels[syl.toneNum] || "？";
        
        // [単語: 母音/最終クラス/タイプ -> 声調]
        // ★ syl.finalClass (属性伝染後) と syl.toneNum をそのまま使うのが「真実」
        return `[${syl.full}: ${syl.vSound || '?'}/${syl.finalClass ? syl.finalClass[0] : '?'}/${(syl.sType || 'D')[0]} -> ${toneLabel}]`;
      });

      console.log(logOutput + details.join(' | '));
    } catch (e) {
      console.error(`【${word}】 ERROR: ${e.message}`);
    }
  });

  console.log("=== THAI LOGIC DEBUG END ===");
}
/**
 * GS_Parser: 音節構造解析エンジン (Final Fixed Version)
 */
const GS_Parser = {
  parseSyllables: function(text) {
    if (!text) return [];
    const vMarks = "ะาิีึืุูัำ";
    const leadingV = "เแโใไ";
    const toneMarks = "่้๊๋์";
    const chars = Array.from(text);
    const syllables = [];
    let i = 0;

    while (i < chars.length) {
      let syl = { full: '', leadingV: '', mainC: '', marks: [], lastC: '', isRoHan: false };

      // 1. 前置母音 (เแโใไ) - 最初に見つけたら保持
      if (i < chars.length && leadingV.indexOf(chars[i]) !== -1) {
        syl.leadingV = chars[i]; syl.full += chars[i]; i++;
      }
// 2. 核子音 (Cluster & ฤ / 記号なし核子音の強化)
      if (i < chars.length) {
        syl.mainC = chars[i]; syl.full += chars[i]; i++;
        
        // ฤ (Rue) が核子音として現れた場合の処理
        if (syl.mainC === 'ฤ') {
          // ฤ 自体が母音の性質を持つので、そのまま Step 4 へ
        } else if (i < chars.length) {
          const c2 = chars[i];
          const nextMark = chars[i+1];
          const isHo = syl.mainC === 'ห' && "งญนมรลวยว".indexOf(c2) !== -1;
          const isCluster = "กขคตปผพจสซ".indexOf(syl.mainC) !== -1 && "รลว".indexOf(c2) !== -1;
          
          if (isHo || isCluster) {
            // ★真犯人逮捕：c2が 'ร' で、次も 'ร' なら Ro Han のためクラスタ化しない！
            if (c2 === 'ร' && nextMark === 'ร') {
               // 何もしない（Step 3 の Ro Han 検知に任せる）
            } else if (!(vMarks.indexOf(c2) !== -1 || toneMarks.indexOf(c2) !== -1)) {
               syl.mainC += c2; syl.full += c2; i++;
            }
          }
        }
      }

      // 3. Ro Han (รร) 検知
      if (i + 1 < chars.length && chars[i] === 'ร' && chars[i+1] === 'ร') {
        const next = chars[i+2];
        if (!next || (vMarks.indexOf(next) === -1 && leadingV.indexOf(next) === -1)) {
          syl.isRoHan = true; syl.marks.push('รร'); syl.full += 'รร'; i += 2;
        }
      }

// 4. すべての記号 (上下・声調・黙字記号) および母音構成要素 (ย, ว, อ) の回収
      while (i < chars.length) {
        const c = chars[i];
        const next = chars[i+1];
        
        // 黙字記号 ์ が次にある文字は、末子音として扱うため Step 5 へ
        if (next === '์') break;

        // A. 基本の母音記号・声調記号なら回収
        if (vMarks.indexOf(c) !== -1 || toneMarks.indexOf(c) !== -1 || c === '์') {
          syl.marks.push(c); syl.full += c; i++;
          continue;
        }

        // B. ★重要★ 母音の一部として機能する子音 (ย, ว, อ) の判定
        // 前に特定の母音がある場合、これらは末子音ではなく「母音記号」として marks に入れる
        const currentBase = (syl.leadingV || '') + syl.marks.join('');
        const isVowelPart = 
          (c === 'ย' && currentBase.indexOf('เ') !== -1 && currentBase.indexOf('ี') !== -1) || // เ-ีย
          (c === 'อ' && (currentBase.indexOf('เ') !== -1 || currentBase.indexOf('ื') !== -1)) || // เ-อ, -ือ
          (c === 'ว' && currentBase.indexOf('ั') !== -1); // -ัว (末子音ありの形)

        if (isVowelPart) {
          syl.marks.push(c); syl.full += c; i++;
          continue;
        }
        
        break;
      }

      // 5. 末子音回収 (Greedy Loop)
      while (i < chars.length) {
        const c = chars[i];
        const next = chars[i+1];

        // 次が前置母音なら、今の文字は次音節の開始
        if (leadingV.indexOf(c) !== -1) break;

        // 次に母音記号（์ 以外）があるなら、今の文字は次音節の核子音
        if (next && (vMarks.indexOf(next) !== -1 || toneMarks.indexOf(next) !== -1) && next !== '์') break;

        // 吸い込み
        syl.lastC = c; syl.full += c; i++;

        // 直後に ์ や母音記号(ุ ิ 等)があるなら、それらもセットで回収（黙字道連れ）
        while (i < chars.length && (vMarks.indexOf(chars[i]) !== -1 || toneMarks.indexOf(chars[i]) !== -1 || chars[i] === '์')) {
          syl.marks.push(chars[i]); syl.full += chars[i]; i++;
        }

        // 基本1文字（または黙字セット）で終了
        break;
      }
      syllables.push(syl);
    }


// 最後に、切り出した音節リストをロジック関数に渡して完成させる
    return this.resolveLogic(syllables);
  },



  resolveLogic: function(syllables) {
    
// --- 解析の最後に全音節をスキャン (Logicの集約) ---
    const lowSingles = "งนมยรลวยญณฬ";
    syllables.forEach((syl, i) => {
        const headChar = syl.mainC[0];
        const cObj = ThaiMasterData.consonants[headChar] || { class: '不明' };
        
        syl.finalClass = cObj.class;
        syl.isOverridden = false;
        syl.ruleLabel = "標準";

        // 1. 属性伝染・引導子音の判定
        if (syl.mainC.startsWith('ห') && syl.mainC.length > 1) {
            syl.finalClass = 'High'; syl.isOverridden = true; syl.ruleLabel = "ห引導";
        } else if (i > 0) {
            const prev = syllables[i-1];
            // ★重要: Ro Han (รร) も属性を後ろに流すフラグを強制的に立てる
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

        // 2. 母音と声調の確定
        const vRule = GS_Validator.resolveVowel(syl);
        const tMark = syl.marks.find(m => /[\u0E48-\u0E4B]/.test(m));
        
        // 基本のタイプ
        let sType = syl.lastC ? (ThaiMasterData.terminalGroups[syl.lastC] || 'Dead') : vRule.type;
        
        // ★最重要: Ro Han (รร) の死音化ロジック
        // 次の音節が存在するなら、この Ro Han は促音(Dead)扱い。これで [สรร] が低声になる。
        if (syl.isRoHan && i + 1 < syllables.length) {
            sType = 'Dead';
            syl.ruleLabel = "RoHan(閉)";
        }

        // 3. 最終的な声調番号を確定
        syl.toneNum = GS_Validator.getToneNumber(syl.finalClass, tMark, sType, vRule.length);
        
        // ログ表示用にデータを同期
        syl.sType = sType;
        syl.vSound = syl.isRoHan ? 'a' : vRule.sound;
        syl.vLen = vRule.length;
    });
    return syllables;
}
};

/**
 * GS_Validator: 判定ロジック
 */
const GS_Validator = {
resolveVowel: function(syl) {
  console.log(`DEBUG: [${syl.full}] base: "${(syl.leadingV || '') + syl.marks.filter(m => !/[่้๊๋์]/.test(m)).join('')}" lastC: "${syl.lastC}"`);
const isRoHanChar = syl.full.indexOf('รร') !== -1;

  if (isRoHanChar) {
    return { 
      sound: 'a', 
      length: 'short', 
      // syl.sType が 'Dead' (resolveLogicで設定済み) なら dead を返す
      type: (syl.sType === 'Dead') ? 'dead' : 'live' 
    };
  }
    // 1. 声調記号と黙字記号を徹底除去してベースを作る
    const pure = syl.marks.filter(m => !/[่้๊๋์]/.test(m)).join('');
    const base = (syl.leadingV || '') + pure;
    
    // 2. マスタ側の symbols からもハイフンなどを除去して比較する
    // symbols: 'เ-ีย' と base: 'เีย' を一致させるため
    const normalize = (str) => str.replace(/[-\s]/g, '');

    // 3. マスタ照合（3段構え）
    // A: 記号 + 末子音 (เดี๋ยว のように 'ย' を含むマスタ用)
    // B: 記号のみ
    const withLast = base + (syl.lastC || '');
    let rule = ThaiMasterData.vowelRules.find(r => normalize(r.symbols) === withLast) ||
               ThaiMasterData.vowelRules.find(r => normalize(r.symbols) === base);

    if (rule) {
      // 母音の一部として 'ย' や 'ว' が食われた場合、末子音フラグを消す
      if (normalize(rule.symbols).endsWith(syl.lastC)) {
        syl.isVowelPart = true; 
      }
      return rule;
    }

    // 4. 最終フォールバック
    if (syl.lastC && !syl.isVowelPart) {
      return { sound: 'o', length: 'short', type: 'live' };
    }
    return { sound: 'a', length: 'short', type: 'dead' };
  },
getToneNumber: function(charClass, tMark, sType, vLength) {
    const vLen = (vLength || 'short').toLowerCase();
    
    // 1. 声調記号がある場合（最優先：ここは完璧）
    if (tMark) {
        if (tMark === '่') return (charClass === 'Low') ? 2 : 1;
        if (tMark === '้') return (charClass === 'Low') ? 3 : 2;
        if (tMark === '๊') return 3;
        if (tMark === '๋') return 4;
    }

    // 2. 無記号・生音 (Live Sound) ★ここを厳格に
    // 母音が am, ai, ao 等、または末子音がある Live なら、何があってもここ
    if (sType.toLowerCase() === 'live') {
        return (charClass === 'High') ? 4 : 0; // 高級なら上声(4)、それ以外は平声(0)
    }

    // 3. 無記号・死音 (Dead Sound)
    // 中・高級子音は一律で 低声(1)
    if (charClass === 'High' || charClass === 'Mid') {
        return 1;
    }

    // 4. 低級子音(Low) かつ 死音(Dead) の場合のみ、長短で分岐
    // 短母音なら 高声(3)、長母音なら 下声(2)
    return (vLen === 'short') ? 3 : 2;
}
};
function debugThaiLogic() {
  const testWords = ["สรรพคุณ", "สนุก", "ทำไม", "อร่อย"]; // テストしたい単語
  
  console.log("=== THAI LOGIC DEBUG START ===");

  testWords.forEach(word => {
    try {
      // 1. Parserを叩く（ここですべての属性伝染・声調計算を完結させる）
      const syllables = GS_Parser.parseSyllables(word);
      let logOutput = `【${word}】 -> `;

      // 2. Parserが算出した「syl」オブジェクトの結果を、ただ文字にするだけ
      const details = syllables.map((syl) => {
        // Parserが計算してくれた 0-4 の番号をラベルに変換
        const toneLabels = ["平", "低", "下", "高", "上"];
        const toneLabel = toneLabels[syl.toneNum] || "？";
        
        // [単語: 母音/最終クラス/タイプ -> 声調]
        // ★ syl.finalClass (属性伝染後) と syl.toneNum をそのまま使うのが「真実」
        return `[${syl.full}: ${syl.vSound || '?'}/${syl.finalClass ? syl.finalClass[0] : '?'}/${(syl.sType || 'D')[0]} -> ${toneLabel}]`;
      });

      console.log(logOutput + details.join(' | '));
    } catch (e) {
      console.error(`【${word}】 ERROR: ${e.message}`);
    }
  });

  console.log("=== THAI LOGIC DEBUG END ===");
}
const ThaiMasterData = {
  consonants: {
    'ก': { class: 'Mid', name: 'Ko Kai', sound: 'k' },
    'ข': { class: 'High', name: 'Kho Khai', sound: 'kh' },
    'ฃ': { class: 'High', name: 'Kho Khuat', sound: 'kh' },
    'ค': { class: 'Low', name: 'Kho Khway', sound: 'kh' },
    'ฅ': { class: 'Low', name: 'Kho Khon', sound: 'kh' },
    'ฆ': { class: 'Low', name: 'Kho Rakhang', sound: 'kh' },
    'ง': { class: 'Low', name: 'Ngo Nguu', sound: 'ng' },
    'จ': { class: 'Mid', name: 'Cho Chan', sound: 'ch' },
    'ฉ': { class: 'High', name: 'Cho Ching', sound: 'ch' },
    'ช': { class: 'Low', name: 'Cho Chaang', sound: 'ch' },
    'ซ': { class: 'Low', name: 'So Soo', sound: 's' },
    'ฌ': { class: 'Low', name: 'Cho Choe', sound: 'ch' },
    'ญ': { class: 'Low', name: 'Yo Ying', sound: 'y' },
    'ฎ': { class: 'Mid', name: 'Do Chada', sound: 'd' },
    'ฏ': { class: 'Mid', name: 'To Patak', sound: 't' },
    'ฐ': { class: 'High', name: 'Tho Than', sound: 'th' },
    'ฑ': { class: 'Low', name: 'Tho Montho', sound: 'th' },
    'ฒ': { class: 'Low', name: 'Tho Phuthao', sound: 'th' },
    'ณ': { class: 'Low', name: 'No Nen', sound: 'n' },
    'ด': { class: 'Mid', name: 'Do Dek', sound: 'd' },
    'ต': { class: 'Mid', name: 'To Tao', sound: 't' },
    'ถ': { class: 'High', name: 'Tho Thung', sound: 'th' },
    'ท': { class: 'Low', name: 'Tho Thahaan', sound: 'th' },
    'ธ': { class: 'Low', name: 'Tho Thong', sound: 'th' },
    'น': { class: 'Low', name: 'No Nuu', sound: 'n' },
    'บ': { class: 'Mid', name: 'Bo Baimai', sound: 'b' },
    'ป': { class: 'Mid', name: 'Po Plaa', sound: 'p' },
    'ผ': { class: 'High', name: 'Pho Phueng', sound: 'ph' },
    'ฝ': { class: 'High', name: 'Fo Faa', sound: 'f' },
    'พ': { class: 'Low', name: 'Pho Phan', sound: 'ph' },
    'ฟ': { class: 'Low', name: 'Fo Fan', sound: 'f' },
    'ภ': { class: 'Low', name: 'Pho Samphao', sound: 'ph' },
    'ม': { class: 'Low', name: 'Mo Maa', sound: 'm' },
    'ย': { class: 'Low', name: 'Yo Yak', sound: 'y' },
    'ร': { class: 'Low', name: 'Ro Ruea', sound: 'r' },
    'ล': { class: 'Low', name: 'Lo Ling', sound: 'l' },
    'ว': { class: 'Low', name: 'Wo Waen', sound: 'w' },
    'ศ': { class: 'High', name: 'So Sala', sound: 's' },
    'ษ': { class: 'High', name: 'So Ruesi', sound: 's' },
    'ส': { class: 'High', name: 'So Suea', sound: 's' },
    'ห': { class: 'High', name: 'Ho Hip', sound: 'h' },
    'ฬ': { class: 'Low', name: 'Lo Chula', sound: 'l' },
    'อ': { class: 'Mid', name: 'O Ang', sound: '-' },
    'ฮ': { class: 'Low', name: 'Ho Nok-huk', sound: 'h' },
    'ฤ': { class: 'Low', name: 'Rue', sound: 'rɯ' },
  },

  // vowelRules に追加・上書き（最長一致のため、記号が多い順に並べること）
  vowelRules: [
    // vowelRules の最初に追加
{ symbols: 'เีย', sound: 'ia', length: 'long', type: 'live' },
{ symbols: 'เือ', sound: 'ɯa', length: 'long', type: 'live' },
{ symbols: 'ัว',  sound: 'ua', length: 'long', type: 'live' },
    // --- 3文字セット ---
    { symbols: 'เีย', sound: 'ia', length: 'long', type: 'live' }, // diaw (เดี๋ยว) 等
    { symbols: 'เือ', sound: 'ɯa', length: 'long', type: 'live' }, // muean (เหมือน) 等
    
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
    0: { mark: '', label: '平声 (Mid)', color: 'text-white/40' },
    1: { mark: '̀', label: '低声 (Low)', color: 'text-rose-300' },
    2: { mark: '̂', label: '下声 (Falling)', color: 'text-orange-300' },
    3: { mark: '́', label: '高声 (High)', color: 'text-cyan-300' },
    4: { mark: '̌', label: '上声 (Rising)', color: 'text-yellow-300' }
  },

  classColors: {
    'Low': 'text-blue-400',
    'Mid': 'text-green-400',
    'High': 'text-red-400',
    '不明': 'text-white/30'
  }
};
