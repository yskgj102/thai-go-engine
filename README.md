THAI-GO Engine 🇹🇭
Google Apps Script (GAS) をバックエンドとし、Vanilla JS + Tailwind CSS で構築されたタイ語学習のための超高速SPA（Single Page Application）。
単なるフラッシュカードアプリにとどまらず、現場での実用性とモバイル（特にiOS）での極限のUXを追求したパーソナル学習プラットフォームです。

🌟 Core Features (主要機能)
1. 🧠 忘却曲線ベースの学習エンジン (StudyEngine)
Spaced Repetition（間隔反復）アルゴリズムを採用したフラッシュカード機能。

4段階評価システム: カードめくり後、「Again (赤)」「Hard (黄)」「Good (緑)」「Easy (青)」の4ボタンから忘却度を判定し、次回の出題日（Interval）を自動計算。

ヒートマップ可視化: 過去の学習実績や今後の負荷予測を視覚的にトラッキング可能。

物理UIリセット: カードをめくるたびにDOM要素のクラスをクリーンアップし、スムーズなアニメーションと状態管理を実現（ViewController 連携）。

2. ⚡️ 万能検索窓「Omnibox」＆ リアルタイム辞書 (VocabListUI)
アプリ内のどこからでも0.1秒でアクセスできる検索・追加の司令塔。

超広範インクリメンタルサーチ: タイ語、日本語、発音記号、品詞、解説文に加え、「例文（Example）」の中身までリアルタイムに検索・ハイライト表示。

iOSセキュリティ突破ハック: モバイルブラウザ特有の「ユーザーアクション外でのキーボード起動不可」制限を、透明なダミーInput要素を用いた物理ハックで突破。ボタン1つでキーボード展開とリスト描画を完全同期。

完全な状態同期 (Single Source of Truth): ヘッダー側の入力欄（Add）とリスト側の検索窓（Search）で、ペースト操作やスワイプ開閉時でも値がねじれない堅牢な同期ロジックを実装。

3. 🎧 現場特化のハンズフリー学習 (AutoPlay / AudioSystem)
移動中や作業中でも「耳だけ」で学習を進められるシャドーイングモード。

TTS（Text-to-Speech）連携: Web Speech APIを活用し、タイ語のネイティブ発音と日本語の意味を交互に自動再生。

キューの連続ループ: 画面を見ずに、現在キューに入っている単語リストを自動で回し続けることが可能。

4. 🤖 AIアシスト＆文脈抽出 (ChatSystem & API)
単なる単語の羅列ではなく、「文脈」から学習するための連携機能。

スナイパー型単語抽出: メモや解説文 (explanation) に含まれる タイ文字 (発音記号) : 日本語意味 のフォーマットを正規表現で自動検知し、関連単語リストとして動的にカード下部へUI生成。

GASバックエンドAPI連携: api_ai.gs を経由した外部AI連携により、自然な例文やダイアログの生成基盤を搭載。

5. 🇹🇭 タイ語特化のディープなサポート (ThaiData)
発音記号（Phonetic）＆ 声調（Tone）ルール: タイ語特有の複雑な声調ルールをテーブルとして可視化し、学習中にいつでもリファレンスとして引き出せる機能。

自動書式整形: 長文フレーズや複数行の意味を持つ単語に対し、動的にフォントサイズ（clamp）やCSS Flexboxを用いた強制中央揃えを適用。Tailwindの限界を超えた物理的DOM制御。

🏗 Architecture (システム構成)
完全にモジュール化されたフロントエンド設計により、保守性と拡張性を確保しています。

AppState.html: アプリケーション全体の「唯一の真実（Single Source of Truth）」となる状態管理。

ViewController.html: DOM操作、CSSアニメーション、物理スクロールロックなどを一手に引き受けるUI/UXの司令塔。

VocabListUI.html: 検索・フィルタリング・ハイライト・リスト描画のロジック。

StudyEngine.html: 学習アルゴリズム、カード生成、オートプレイの制御。

AudioSystem.html: ブラウザの音声合成APIのラッパー。

Bridge.html: フロントエンドとGAS (google.script.run) を繋ぐ非同期通信レイヤー。

GAS Backend (*.gs): core.gs によるルーティング、db_access.gs によるスプレッドシート（DB代わり）へのCRUD処理。

🛠 Tech Stack
Frontend: HTML5, Vanilla JavaScript, Tailwind CSS

Backend: Google Apps Script (GAS)

Database: Google Sheets

PWA Ready: Web App Manifest対応（予定/構築中）
