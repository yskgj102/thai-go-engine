/**
 * ファイル名: line_bot.gs
 * 役割: LINE Messaging APIとの通信、およびFlex MessageのUI生成
 */

// LINE Developersで取得したチャネルアクセストークンをスクリプトプロパティに設定してください
const LINE_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');

/**
 * 1. Webhookの処理 (doPost)
 * LINEからのイベントを受け取り、Reply APIで返信します。
 */
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return ContentService.createTextOutput("OK");

  try {
    const json = JSON.parse(e.postData.contents);

    json.events.forEach(event => {
      // テキストメッセージのみ処理
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text.trim();
        const replyToken = event.replyToken;

        // 検索ロジックを実行
        const searchResults = searchVocabularyForLine(userMessage);

        // Flex Message（またはエラーテキスト）を生成
        const replyMessage = buildFlexMessage(searchResults, userMessage);

        // Reply APIで送信（Push APIは不使用）
        sendLineReply(replyToken, replyMessage);
      }
    });
  } catch (error) {
    console.error("LINE Webhook Error:", error);
  }

  // LINE側へ200 OKを返す
  return ContentService.createTextOutput(JSON.stringify({ content: "ok" })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * LINE Reply APIへPOSTリクエストを送信する共通関数
 */
function sendLineReply(replyToken, messageObj) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  
  const payload = {
    replyToken: replyToken,
    messages: [messageObj]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}

/**
 * db_access.gsの getRawVocabulary() を利用して検索を行う
 * タイ語、日本語、発音記号のいずれかで部分一致検索
 */
function searchVocabularyForLine(keyword) {
  const allData = getRawVocabulary(); // 既存のコア関数を呼び出し
  if (!allData || allData.length === 0) return [];

  const lowerKeyword = keyword.toLowerCase();
  
  const hits = allData.filter(item => {
    const matchTh = item.word_th && item.word_th.includes(keyword);
    const matchJa = item.meaning_ja && item.meaning_ja.includes(keyword);
    const matchPh = item.phonetic && item.phonetic.toLowerCase().includes(lowerKeyword);
    return matchTh || matchJa || matchPh;
  });

  // LINEのCarouselは最大10件までの制限があるため、スライスして返す
  return hits.slice(0, 10);
}

/**
 * 2. Flex Message (JSON) のUI設計
 * 検索結果から見やすいFlex Message（またはテキスト）を構築します
 */
function buildFlexMessage(results, keyword) {
  // 3. エラーハンドリングとフォールバック
  if (!results || results.length === 0) {
    return {
      type: "text",
      text: `「${keyword}」は見つかりませんでした😢\n別の単語や意味で試してみてください。`
    };
  }

  // ヒットした単語ごとのBubble(カード)を生成
  const bubbles = results.map(item => {
    return {
      type: "bubble",
      size: "kilo", // 少しスマートな横幅
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          // 【ヘッダー領域】: タイ語と発音記号
          {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: item.word_th || "不明",
                weight: "bold",
                size: "xl",
                color: "#06C755", // LINEグリーン
                wrap: true
              },
              {
                type: "text",
                text: item.phonetic || "---",
                size: "sm",
                color: "#888888",
                wrap: true
              }
            ]
          },
          // 【メイン意味領域】: 日本語
          {
            type: "text",
            text: item.meaning_ja || "意味が登録されていません",
            weight: "bold",
            size: "lg",
            color: "#111111",
            wrap: true,
            margin: "md"
          },
          // 【区切り線】
          {
            type: "separator",
            margin: "md"
          },
          // 【例文領域】: タイ語例文と日本語訳
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: item.example_th || "例文がありません",
                wrap: true,
                size: "sm",
                color: "#333333"
              },
              {
                type: "text",
                text: item.example_ja || "",
                wrap: true,
                size: "xs",
                color: "#666666"
              }
            ]
          },
          // 【区切り線】
          {
            type: "separator",
            margin: "md"
          },
          // 【詳細解説領域】: 語源やニュアンス
          {
            type: "text",
            text: item.explanation || "解説がありません",
            wrap: true,
            size: "xs",
            color: "#888888",
            maxLines: 6, // 縦伸び防止
            margin: "md"
          }
        ]
      }
    };
  });

  // 単体ならBubble、複数ならCarouselで返す
  if (bubbles.length === 1) {
    return {
      type: "flex",
      altText: `【検索結果】${results[0].word_th}`,
      contents: bubbles[0]
    };
  } else {
    return {
      type: "flex",
      altText: `「${keyword}」の検索結果（${bubbles.length}件）`,
      contents: {
        type: "carousel",
        contents: bubbles
      }
    };
  }
}