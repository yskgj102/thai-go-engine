/**
 * ファイル名: core.gs
 * 役割: 画面表示と共通ヘルパー
 * アプリの起動（HTMLの書き出し）を制御する中心的なファイルです。
 */

/**
 * アプリ公開時のメインエントリポイント
 * ユーザーがURLにアクセスした際に、最初に実行されます。
 */
function doGet() {
  // index.htmlをテンプレートとして読み込む
  return HtmlService.createTemplateFromFile('index')
    .evaluate() // テンプレート内のスクリプト（<?!= ... ?>など）を実行
    .setTitle('THAI-GO Engine') // ブラウザのタブに表示されるタイトル
    .addMetaTag('viewport', 'width=device-width, initial-scale=1'); // スマホ向けの表示最適化
}

/**
 * HTMLファイルをインクルードするためのヘルパー関数
 * index.html内で別のファイル（CSSやJS）を読み込むために使用します。
 */
function include(filename) {
  // 指定されたファイルの内容をテキストとして取得して返す
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}