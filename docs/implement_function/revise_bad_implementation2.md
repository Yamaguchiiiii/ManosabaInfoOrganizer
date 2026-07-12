# 不具合要因の検討と対処 その2（32件）— 実装指示書（詳細版）

最終更新: 2026-07-11（コード未変更）
`docs/_symptoms/0711.md` の症状に**近い領域**（sync/時間計算・Note Canvas 選択/描画・テーマ・遷移/入力・モバイル）を集中レビューし、見落とされていた不具合要因 32 件を列挙する。各項に、そのまま実装できる修正・手順・受入条件を付す。行番号は working tree（ブランチ `work/perf-image-ui-foundations`）2026-07-11 時点基準。ずれても検索できるよう grep アンカーを併記。

前提: `docs/resolve_error/21.md`（0711 直接対応）を先に実施すること。**№5 は 21 §E-1、№27 は 21 §B と同一修正**（21 側を実施すればここでは確認のみ）。№1〜4 は「sync を使うほどズレる」系の**現存する実バグ**で最優先。

検証コマンド: `npx tsc -p tsconfig.json --noEmit` → `npm run build` → `npx vitest run`（21 実施後 30 件想定） → preview 実機（1280px / 375px）。

| No | 区分 | 事象（要約） | 重大度 | 修正先 |
|---|---|---|---|---|
| 1 | 時間計算 | ガントバーの滞在/移動帯が sync（アンカー）未反映 | **高** | animationUtils + TimelineGantt |
| 2 | 時間計算 | 同室=会話の自動検出が sync 未反映で時刻ズレ | **高** | encounterDetection |
| 3 | 時間計算 | 開始条件(startRef)の基準キャラに sync があると開始時刻がズレる | **高** | resolveStartTimes |
| 4 | 表示整合 | 無効化された sync も「⚇遭遇」として一覧・目盛りに出る（偽イベント） | 高 | usePresetEvents |
| 5 | 時間計算 | 訪問オカレンス列挙が滞在（連続重複）を集約しない | 高 | =21 §E-1 |
| 6 | 整合性 | Edit/制約削除時の syncTarget 復元に occurrence が無く startTime 再計算がズレる | 高 | useRouteEditor |
| 7 | 整合性 | sync 制約を削除しても startTime が残留し「謎の待機」になる | 中 | useRouteEditor |
| 8 | 整合性 | 一括保存が同一オブジェクト参照を共有し、sync/startRef を全キャラに複製 | 中 | presetSlice |
| 9 | UX | 合流候補に死亡キャラが混ざる | 低 | useRouteEditor |
| 10 | UX | sync 設定中も開始条件(startRef) UI が操作可能（実際は無視される） | 中 | RouteDock/WaypointPanel |
| 11 | UX | プリセット切替後も再生(isPlaying)が続き勝手に動き出す | 中 | useAnimationPositions |
| 12 | UX | sync 整合性警告が保存時トーストのみで消える（常設表示なし） | 中 | AnimationTimeline+RouteDock |
| 13 | 選択 | マーキー選択が「原点が矩形内」判定＝大きい図形・線・回転を取り逃す | **高** | CanvasWorkspace |
| 14 | 変形 | 複数選択リサイズで比率維持画像が歪む | 中 | CanvasWorkspace(Transformer) |
| 15 | 入力 | キャラノートの A/D 切替が配置・描画中にも発火し描きかけが消える | 中 | NoteView+useNoteKeyboard |
| 16 | 整合性 | 複数/グループドラッグ確定の冪等性が render 時スナップショット頼み | 中 | CanvasWorkspace |
| 17 | 表示 | 複数選択時のテキスト選択破線が実寸と不一致（幅150固定） | 低 | CanvasWorkspace |
| 18 | UX | 画像一覧/再生盤フローティングがウィンドウ縮小で画面外に残る | 低 | CanvasWorkspace+AnimateView |
| 19 | 出力 | fill系ノートのPNG書き出し解像度・範囲がウィンドウ依存 | 中 | CanvasWorkspace |
| 20 | データ救済 | ビューポート外オブジェクトの回収手段が無い | 中 | CanvasWorkspace+Tools |
| 21 | 入力 | Ctrl+C/X/V/Delete が body フォーカス限定＝ボタン押下直後に効かない | 中 | useNoteKeyboard |
| 22 | タッチ | Note Canvas の Stage がマウスイベントのみ＝タッチでマーキー/図形/ペンが不能 | **高** | CanvasWorkspace |
| 23 | テーマ | LoadingScreen が固定暗色＝セピアで遷移毎に暗転フラッシュ | 中 | LoadingScreen |
| 24 | テーマ | モーダル群（Merge/NodeEdit/CharSelect/Follow/Modal.scss）が固定暗色 | 中 | modals+Modal.scss |
| 25 | テーマ | HelpDrawer/コンテキストメニュー等オーバーレイ群の固定暗色＋全域スイープ | 中 | 複数 |
| 26 | テーマ | 会話/遭遇のアクセント色が直書き（#2fd0d0 等） | 低 | _tokens+各所 |
| 27 | 遷移 | handleTransition 中の例外で遷移ロックが永続 | 中 | =21 §B |
| 28 | 遷移 | 初回 lazy 読込時に Suspense fallback と遷移オーバーレイが二重表示 | 低 | App |
| 29 | 入力 | ダイアログ表示中も Space再生/Delete削除等のグローバルキーが生きている | 中 | 各キーハンドラ |
| 30 | 整合性 | オブジェクトIDが `Date.now()` 依存で衝突し得る | 中 | CanvasWorkspace ほか |
| 31 | UX | RouteDock の sync 表示が「生フレーム値・相手名なし」で読めない | 低 | RouteDock |
| 32 | 整合性 | プリセット切替でイベントのキャラ絞り込み(eventFilterChar)が残留 | 低 | presetSlice |

---

## №1【高】ガントバーの滞在/移動帯が sync（アンカー）未反映

- **事象**: `src/components/animate/TimelineGantt.tsx`（grep: `const rows = useMemo<GanttRow[]>`）は、行の全体スパンは `computeAnchors`（sync 反映済み）で計算するのに、**滞在帯は `getNodeVisitTimes`（duration 一定按分・sync 無視）**で計算している。sync を持つキャラは実移動（アンカー間で速度が変わる）と帯の位置がズレ、「帯では滞在中なのにマップでは移動中」になる。
- **修正**: `src/utils/animationUtils.ts` に「アンカー対応の時刻変換」を追加し、訪問時刻計算をそれ経由にする。
  ```ts
  // 累積距離 cum に到達する時刻を anchors（sync 反映後）で返す。anchors が2点（start/end）なら従来の按分と一致。
  export const timeAtCumDist = (anchors: TimeAnchor[], cum: number): number => {
      if (anchors.length === 0) return 0;
      if (cum <= anchors[0].cumDist) return anchors[0].time;
      for (let i = 0; i < anchors.length - 1; i++) {
          const a = anchors[i], b = anchors[i + 1];
          if (cum <= b.cumDist) {
              const t = b.cumDist > a.cumDist ? (cum - a.cumDist) / (b.cumDist - a.cumDist) : 1;
              return a.time + (b.time - a.time) * t;
          }
      }
      return anchors[anchors.length - 1].time;
  };
  ```
  さらに `getNodeVisitTimes` に anchors 版を追加（既存シグネチャは互換維持）:
  ```ts
  export const getNodeVisitTimesAnchored = (charData, targetNodeId, allNodes): { arrival: number; departure: number }[] => {
      const cached = precomputePath(charData.path, allNodes instanceof Array ? allNodes : Object.values(allNodes));
      const anchors = computeAnchors(charData, cached);
      // 既存 getNodeVisitTimes と同じ cumAt 走査を行い、timeAt(c) を timeAtCumDist(anchors, c) に置き換える
  };
  ```
  `TimelineGantt.tsx` の `getNodeVisitTimes(charData, nodeId, nodes)` 呼び出し（grep: `getNodeVisitTimes(charData, nodeId, nodes)`）を `getNodeVisitTimesAnchored` へ置換。
- **受入**: バックアップ `manosaba-backup-20260711-0204.json` のエマ（sync 2件持ち）の滞在帯（濃帯）クリック→シークで、マップ上のエマが実際にその地点に静止している。sync なしキャラの帯は従来と同一。

## №2【高】同室=会話の自動検出が sync 未反映

- **事象**: `src/utils/encounterDetection.ts`（grep: `getNodeVisitTimes(cd, nid, nodes)`）も №1 と同じく duration 按分で滞在区間を計算する。sync キャラは実際の滞在時間帯とズレるため、**本当は同室の2人を検出しない／同室でないのに検出する**。「誰と誰がいつ同じ部屋に居たか」は本作の推理の核（ファイル冒頭コメント）であり、致命的。
- **修正**: №1 の `getNodeVisitTimesAnchored` に置換（1行）。`resolvedStarts` 反映済み `cd` を渡している既存構造はそのまま。
- **受入**: sync で合流させた2キャラの合流地点滞在が「💬会話」として正しい時間帯（アンカー時刻）で一覧・シークバー帯に出る。sync なしプリセットの検出結果は完全不変（`timeAtCumDist` がアンカー2点時に按分一致するため）。

## №3【高】開始条件(startRef)の基準キャラに sync があると開始時刻がズレる

- **事象**: `src/utils/animationUtils.ts` `resolveStartTimes`（grep: `const visits = getNodeVisitTimes({ ...refData, startTime: refStart }, ref.nodeId, allNodes);`）が基準キャラの到達時刻を duration 按分で計算。基準キャラが sync を持つ場合（=アンカーで速度が変わる場合）、「基準キャラが地点に到達後に開始」の時刻が実移動とズレる。
- **修正**: 該当行を `getNodeVisitTimesAnchored`（№1）に置換。基準キャラの `startTime` は再帰解決済みの `refStart` を使う現行構造のまま。※ `syncConstraints` を持つキャラ自身は startRef 無視（既存仕様）なので循環しない。
- **受入**: 「A が sync で遅らされて地点Xに到達」→「B は A が X 到達後に開始」の構成で、B が A の**実際の**到達と同時に動き出す（従来は早く/遅く動き出していた）。

## №4【高】無効化された sync も「⚇遭遇」として表示される（偽イベント）

- **事象**: `src/hooks/usePresetEvents.ts`（grep: `events.push({ kind: 'pass'`）は `syncConstraints` を無条件にイベント化する。21 §E-5 で「過去向き合流はアンカー無効化」となるため、バックアップのノア×ミリア「⚇ 00:00」のような**実際には誰も出会わないイベント**が一覧・シークバー金色目盛りに残る。
- **修正**: 制約ごとに「その時刻に本人が本当にその地点に居るか」を検証してから push する:
  ```ts
  // ⚇ 遭遇: 実際にその時刻へ到達できる制約だけをイベント化する（無効化された合流の偽表示防止）
  const nodeMap: Record<string, MapNode> = {}; nodes.forEach(n => { nodeMap[n.id] = n; });
  Object.entries(activePreset.data).forEach(([id, raw]) => {
      const base = normalizeTimelineData(raw);
      if (!base) return;
      const cd = { ...base, startTime: resolvedStarts[id] ?? base.startTime ?? 0 };
      const cached = precomputePath(cd.path, nodes);
      const anchors = computeAnchors(cd, cached);
      (base.syncConstraints || []).forEach(sc => {
          const pos = calculateRawPositionCached(cd, sc.meetingTime, cached, anchors);
          const node = nodeMap[sc.waypointId];
          const there = pos && node && pos.floor === node.floor
              && Math.hypot(pos.x - node.x, pos.y - node.y) < 10;   // 論理10px以内なら滞在中とみなす
          if (!there) return;   // 無効化された合流 → イベント化しない（保存時に validate が error を出す）
          …既存の seen 重複除去 + push…
      });
  });
  ```
  import 追加: `calculateRawPositionCached, precomputePath, computeAnchors`、`MapNode`。
- **受入**: バックアップをインポートした状態で、イベント一覧に「⚇ 00:00 ノア・ミリア」が**出ない**。正常な sync（エマ×ヒロ）は従来どおり出る。シークバーの金色目盛りも同様。

## №5【高】訪問オカレンス列挙が滞在を集約しない — **21 §E-1 と同一**

- **事象**: `getNodeArrivalOccurrences`（grep: `export const getNodeArrivalOccurrences`）は path の連続重複（滞在表現）を 1 訪問に集約せず、滞在 3 フレーム分が「3回の訪問」として列挙される。21 §E の訪問選択 UI に重複行が出る・自動選択が滞在途中の時刻を拾う。
- **修正**: 21 §E-1 の `getNodeVisitOccurrences`（集約版）を実装し、`getNodeArrivalOccurrences` の使用箇所（`useRouteEditor.ts` のみ）を置き換えたら**旧関数は削除**する。
- **受入**: 21 §E の受入 2 に含む。滞在付き地点への sync でモーダルの訪問選択肢が訪問数どおり（滞在フレーム数ぶん増えない）。

## №6【高】syncTarget 復元に occurrence が無く startTime 再計算がズレる

- **事象**: `src/hooks/useRouteEditor.ts` の
  - `handleEditPath`（grep: `setSyncTarget({ waypointId: restoredConstraints[0].waypointId, meetingTime: restoredConstraints[0].meetingTime });`）
  - `handleRemoveSyncConstraint`（grep: `setSyncTarget({ waypointId: next[0].waypointId, meetingTime: next[0].meetingTime });`）
  はどちらも `pathIndex` を渡さない。syncTarget 消費側（grep: `const pi = syncTarget.pathIndex;`）は pathIndex 不一致時に **node id の最初の出現**へフォールバックするため、「2回目の訪問」をアンカーにしていた経路を Edit すると startTime が1回目基準で再計算されてズレる。さらにどちらも「制約先頭」をアンカーにするが、正しくは `handleMergeConfirm` と同じ「**経路上で最も手前の制約**」（grep: `let earliest = nextConstraints[0]`）。
- **修正**: `handleMergeConfirm` 内の `idxOf`（occurrence→pathIndex 解決）と earliest 選定をヘルパー関数 `pickAnchorTarget(constraints: SyncConstraint[], path: string[]): { waypointId, meetingTime, pathIndex } | null` に抽出し、`handleEditPath` / `handleRemoveSyncConstraint` / `handleMergeConfirm` の3箇所すべてで使う。`handleEditPath` では復元時の path（`currentData.path`）を渡す。
- **受入**: 同一地点を2回通り、2回目の訪問に sync した経路を保存 → Edit → 何も変えず Save しても startTime・meetingTime が変わらない（保存前後で `presets` データが同一）。制約を1つ削除した際、残った制約のうち経路上最も手前のものがアンカー（RouteDock の anchor バッジ）になる。

## №7【中】sync 制約を削除しても startTime が残留する

- **事象**: 制約が 0 件になったとき `handleRemoveSyncConstraint` は `setSyncTarget(null)` するだけで `startTime` は sync が設定した値（例: 1185.5）のまま。ユーザーには「開始条件も sync も無いのに 20 秒待機するキャラ」に見える。
- **修正**: 制約が 0 件になった分岐（grep: `setSyncTarget(null);`、handleRemoveSyncConstraint 内）で待機をリセットする:
  ```ts
  } else {
      setSyncTarget(null);
      setStartTime(0);   // sync 由来の開始遅延を破棄（開始条件 startRef を使う場合はそちらが優先される）
  }
  ```
- **受入**: sync を1件設定（startTime が自動変更される）→ その制約を × で削除 → Save → Animate で該当キャラが t=0 から動く。

## №8【中】一括保存の参照共有と sync/startRef の複製

- **事象**: `src/store/presetSlice.ts` `saveBatchCharacterAnimations`（grep: `charIds.forEach(charId => { newData[charId] = timelineData; });`）は**同一オブジェクト参照**を全キャラに代入し、`syncConstraints`/`startRef`/`waypoints` 配列も共有される。さらに sync の意味（「このキャラが相手に合わせる」）に対し、相手 charId を含む制約がそのまま複数キャラへコピーされ、**バッチ内のキャラ自身が合流相手に入る自己参照**も起こる。
- **修正**:
  ```ts
  charIds.forEach(charId => {
      newData[charId] = {
          ...timelineData,
          path: [...path],
          waypoints: waypoints.map(w => ({ ...w })),
          startRef: startRef ? { ...startRef } : startRef,
          // 自分自身を合流相手に含む制約を除去し、空になった制約は破棄
          syncConstraints: (syncConstraints ?? []).map(sc => ({
              ...sc, charIds: sc.charIds.filter(c => c !== charId),
          })).filter(sc => sc.charIds.length > 0),
      };
  });
  ```
- **受入**: 2キャラへ一括保存後、片方を `updateTimelineItem` 等で変更してももう片方が変わらない（参照独立）。A・B を一括保存し「C と合流」の sync を付けた場合、A/B 双方の制約に C だけが入っている。

## №9【低】合流候補に死亡キャラが混ざる

- **事象**: `handleSyncTime` の候補列挙（grep: `if (selectedIcons.includes(cid)) return;`）は `deadIcons` を見ないため、死亡設定キャラ（B1牢獄固定表示）が合流候補に出る。
- **修正**: 同 return 行の直後に `if ((activePreset.deadIcons || []).includes(cid)) return;` を追加。
- **受入**: 💀設定したキャラが MergeModal に出ない。💀解除すると再び出る。

## №10【中】sync 設定中も開始条件(startRef) UI が操作可能

- **事象**: `resolveStartTimes` は sync 制約があるキャラの startRef を**無視**する（grep: `if (!ref || hasSync)`）が、`RouteDock.tsx`/`WaypointPanel.tsx` の「開始条件」セレクトは sync 中も普通に操作でき、設定しても効かない（無言で無視）。
- **修正**: 両コンポーネントの開始条件セクションに `syncConstraints.length > 0` のとき:
  - セレクト群を `disabled` にし、
  - 注記 `<span className="route-dock__start-condition-text">sync 設定中は開始時刻が合流で決まるため使えません</span>` を表示。
  （props に `syncConstraints` は既に渡っている）
- **受入**: sync を1件付けると開始条件 UI がグレーアウト+注記表示。制約を全部消すと再度操作できる。

## №11【中】プリセット切替後も再生が続く

- **事象**: `src/hooks/useAnimationPositions.ts` のプリセット切替 effect（grep: `usePlaybackStore.setState({ currentTime: 0 });`）は時刻を 0 に戻すが `isPlaying` を止めないため、再生中に AnimationTimeline のプリセット select を替えると**新プリセットが勝手に頭から再生される**。
- **修正**: 同行を `usePlaybackStore.setState({ currentTime: 0, isPlaying: false });` に変更。
- **受入**: 再生中にプリセットを切り替えると停止状態の 00:00 で待機し、Play で再生開始。

## №12【中】sync 整合性警告が保存時トーストのみで消える

- **事象**: `validatePresetSync` の結果は `handleSavePath`（grep: `sync 警告`）のトースト/アラートでしか出ず、後から Animate を見た人には「なぜかズレる」だけが残る（21 §E-6 で error 化しても、表示機会が保存時のみ）。
- **修正**: 検証をフック化して常設バッジを出す。
  1. `src/hooks/usePresetSyncIssues.ts` 新設:
     ```ts
     export const usePresetSyncIssues = (): SyncIssue[] => {
         const presets = useAppStore(s => s.presets);
         const activePresetId = useAppStore(s => s.activePresetId);
         const nodes = useAppStore(s => s.nodes);
         return useMemo(() => {
             const p = presets.find(pp => pp.id === activePresetId);
             return p?.data ? validatePresetSync(p.data, nodes) : [];
         }, [presets, activePresetId, nodes]);
     };
     ```
  2. `AnimationTimeline.tsx` の 🗓 の隣に `issues.length > 0` のとき `⚠ {errors.length + warns.length}` バッジ（`title={messages.join('\n')}`、error があれば `var(--danger)`、warn のみは `var(--warning)`）。
  3. `RouteDock.tsx` ヘッダの「経路 n地点」の隣にも同バッジ（クリックで `showAlert(messages)`）。
- **受入**: バックアップ（破損 sync 入り）を開くと Animate の操作盤と Create の RouteDock に ⚠ が常時見え、ホバー/クリックで全文が読める。問題を直すと消える。

## №13【高】マーキー選択が「原点が矩形内」判定

- **事象**: `CanvasWorkspace.tsx` `handleStageMouseUp`（grep: `if (obj.x >= box.x && obj.x <= box.x + box.width`）が**オブジェクトの原点 (x,y) の包含**だけで判定。矩形の右下だけ囲む・線(points)の途中だけ囲む・回転済み図形などで「見えているのに選択されない」。円/三角は中心原点、線は始点原点で、種別ごとに体感が不揃い。
- **修正**: Konva の実寸バウンディングボックス交差に置換:
  ```ts
  const layer = e.target.getStage()?.getLayers()[0];
  objs.forEach(obj => {
      const node = e.target.getStage()?.findOne(`#${obj.id}`);
      if (!node || !layer) return;
      // 論理座標系（Layer 相対）の実寸ボックスで交差判定（回転・スケール・種別差を吸収）
      const r = node.getClientRect({ relativeTo: layer });
      const hit = r.x < box.x + box.width && r.x + r.width > box.x
               && r.y < box.y + box.height && r.y + r.height > box.y;
      if (hit) newSelectedIds.push(obj.id);
  });
  ```
  （`relativeTo: layer` で Layer の scale を除いた論理座標になる。box は既に論理座標）
- **受入**: 図形の一部だけを囲っても選択される。矢印/フリーハンドの中間部だけ囲っても選択される。回転させた矩形も見た目どおり選択される。何も囲わなければ選択解除（従来どおり）。

## №14【中】複数選択リサイズで比率維持画像が歪む

- **事象**: Transformer の `keepRatio`（grep: `keepRatio={` in CanvasWorkspace）は `selectedIds.length === 1` の場合しか見ておらず、複数選択に比率維持画像（`keepRatio: true`）が含まれていても**自由比率で伸縮**され、立ち絵が歪む。
- **修正**: 判定を拡張:
  ```tsx
  keepRatio={
      selectedIds.length === 1
          ? (selectedObject?.type === 'circle' || selectedObject?.type === 'triangle' ||
             (selectedObject?.type === 'image' && (selectedObject?.keepRatio ?? true)))
          : currentCanvasObjects.some(o => selectedIds.includes(o.id) &&
             (o.type === 'circle' || o.type === 'triangle' || (o.type === 'image' && (o.keepRatio ?? true))))
  }
  ```
- **受入**: 立ち絵+矩形を複数選択して角ハンドルでリサイズ → 立ち絵の縦横比が保たれる。比率維持オブジェクトを含まない複数選択は従来どおり自由伸縮。

## №15【中】A/D キャラ切替が配置・描画中にも発火

- **事象**: `src/components/NoteView.tsx` の A/D・←→ ハンドラ（grep: `activeNoteTab === 'character' && e.target === document.body`）は `placementMode`/描画中を知らない。フリーハンドで「a」「d」を含む操作や矢印キーに触れると**描画途中でキャラが切り替わり、描きかけが消える**（ペイン切替 W/S は `useNoteKeyboard` 側でガード済みという非対称）。
- **修正**: A/D 処理を `useNoteKeyboard` へ移設し、既存ガード（grep: `if (!placementMode && !shapeContextMenu && !isDrawingRef.current)`）の中に入れる。
  1. `useNoteKeyboard` の引数に `onSwitchChar?: (dir: -1 | 1) => void` を追加し、W/S ブロックの隣へ:
     ```ts
     if (onSwitchChar && (e.key.toLowerCase() === 'a' || e.key === 'ArrowLeft')) onSwitchChar(-1);
     if (onSwitchChar && (e.key.toLowerCase() === 'd' || e.key === 'ArrowRight')) onSwitchChar(1);
     ```
  2. `CanvasWorkspace` に props `onSwitchChar?: (dir: -1 | 1) => void` を追加してそのまま `useNoteKeyboard` へ渡す。
  3. `NoteView.tsx` は独自 keydown リスナー（L47-61）を削除し、character 用 `CanvasWorkspace` に `onSwitchChar={(d) => setActualCharIndex((actualCharIndex + d + ICON_FILES.length) % ICON_FILES.length)}` を渡す。
- **受入**: ペン描画中に A/D/←/→ を押してもキャラが切り替わらない。非描画時は従来どおり切り替わる。他ノート種別では無反応。

## №16【中】ドラッグ確定の冪等性が render 時スナップショット頼み

- **事象**: 複数/グループの連動ドラッグでは、同一 mouseup 内に各ノードの `dragend` → `handleObjectDragEnd` が複数回走る。二重移動にならないのは「closure の `obj`/`objects` がドラッグ前の値のまま」という偶然の冪等性による。ドラッグ中に `commitThrottled`（色変更の遅延コミット）等で store が更新されると closure が新しくなり、**差分が二重適用**され得る。
- **修正**: ドラッグ基準座標を ref に固定する。
  1. `const dragBaseRef = useRef<Map<string, { x: number; y: number }> | null>(null);`
  2. 21 §J で追加する `onDragStart` の先頭で（選択数に関わらず）:
     ```ts
     const base = new Map<string, { x: number; y: number }>();
     objects.forEach(o => base.set(o.id, { x: o.x ?? 0, y: o.y ?? 0 }));
     dragBaseRef.current = base;
     ```
  3. `handleObjectDragEnd` の `applyMove` 内（grep: `const applyMove = (dx: number, dy: number`）で、store 現在値ではなく基準値から書く:
     ```ts
     const baseOf = (id: string, cur: { x?: number; y?: number }) =>
         dragBaseRef.current?.get(id) ?? { x: cur.x ?? 0, y: cur.y ?? 0 };
     // groupObjs.map(m => ({ id: m.id, attrs: { x: baseOf(m.id, m).x + dx, y: baseOf(m.id, m).y + dy, ...extra } }))
     // 単体も同様に baseOf(obj.id, obj) を基準にする
     ```
     `dx` の算出も `rawX - baseOf(obj.id, obj).x` に揃える。
- **受入**: グループをドラッグ中に（別手で）色スライダー操作を行っても、ドロップ位置が正しい。通常ドラッグ・ペイン跨ぎ・スナップの挙動不変。`npx vitest run` パス。

## №17【低】テキスト選択破線が実寸と不一致

- **事象**: 複数選択時のテキストインジケータ（grep: `sel_indicator_`）が `width={(o.width || 150) + 4}`・`height={(o.fontSize||24)*1.5+4}` の**固定推定値**で、長文/改行テキストと大きく食い違う。
- **修正**: 実ノードの実寸を使う。ペイン render 内で:
  ```tsx
  {selectedIds.length > 1 && objs
      .filter(o => o.type === 'text' && selectedIds.includes(o.id))
      .map(o => {
          const node = stageRefs.current[index]?.findOne(`#${o.id}`);
          const w = node ? node.width() * (node.scaleX() || 1) : (o.width || 150);
          const h = node ? node.height() * (node.scaleY() || 1) : (o.fontSize || 24) * 1.5;
          return <Rect key={`sel_indicator_${o.id}`} … width={w + 4} height={h + 4} … />;
      })}
  ```
  （render 中の findOne は読み取りのみで安全。ノード未生成の初回だけ従来の推定値にフォールバック）
- **受入**: 3行の長文テキストを含む複数選択で、破線枠が文字列全体を囲む。

## №18【低】フローティング UI がウィンドウ縮小で画面外に残る

- **事象**: `CanvasWorkspace` の画像一覧（`galleryPos`）と `AnimateView` のフローティング再生盤（`timelinePos`、📌解除時のみ）はドラッグ位置を保持するが、ウィンドウを縮めると**画面外に取り残されて掴めなくなる**。
- **修正**: 両ファイルに共通の clamp を追加:
  ```ts
  useEffect(() => {
      const onResize = () => {
          setGalleryPos(p => p && ({
              x: Math.min(Math.max(0, p.x), window.innerWidth - 60),
              y: Math.min(Math.max(0, p.y), window.innerHeight - 40),
          }));
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
  }, []);
  ```
  （AnimateView は `setTimelinePos` で同様。60/40 はヘッダ分の最低可視量）
- **受入**: 画像一覧/フローティング再生盤を右下隅へ寄せてからウィンドウを半分に縮小 → どちらも画面内に留まり操作できる。

## №19【中】fill系ノートの PNG 書き出しがウィンドウ依存

- **事象**: `capturePane`（grep: `? stage.toDataURL({ pixelRatio: 2 / s`）は preset のみズーム非依存の `2/s` を使い、fill 系（全体/キャラ/メモ）は `pixelRatio: 2` 固定。fill 系は Stage の物理 px がウィンドウ寸に依存するため、**同じノートでも書き出し解像度がウィンドウサイズで変わる**（小窓で書き出すと低解像度）。
- **修正**: 分岐を撤去して常に論理基準で出力する:
  ```ts
  return stage.toDataURL({ pixelRatio: 2 / s, mimeType: 'image/png' });   // 論理1px=2px 固定
  ```
  （s は Layer の scale。これで出力は「論理ビューポート寸 ×2」となり、21 §A の安定化と合わせてウィンドウ非依存になる。範囲自体は仕様どおり「そのノートのビューポート」）
- **受入**: 同じキャラノートを 1280px と 900px のウィンドウで PNG 書き出し → 画像の px 寸法・写る範囲が一致する。preset の書き出しは従来どおり 2400×1600。

## №20【中】ビューポート外オブジェクトの回収手段が無い

- **事象**: fill 系ノートでは広いウィンドウで置いたオブジェクトが、狭いウィンドウでは**ビューポート外＝見えない・クリック不能**になり、ユーザーには消えたように見える（21 §A の仕様化で「窓を広げれば見える」が、モバイル等では広げられない）。
- **修正**: Tools に回収ボタンを追加する。
  1. `CanvasWorkspace` にハンドラ:
     ```ts
     // 現在ペインのビューポート外にあるオブジェクトを、右端/下端が収まる位置へ移動する（履歴1回）
     const handleGatherOutside = () => {
         const outside = currentCanvasObjects.filter(o =>
             (o.x ?? 0) < 0 || (o.y ?? 0) < 0 || (o.x ?? 0) > viewW - 40 || (o.y ?? 0) > viewH - 40);
         if (outside.length === 0) { toast.info('画面外のオブジェクトはありません'); return; }
         saveNoteHistory();   // 引数なし（noteSlice のシグネチャ）
         updateNoteObjects(targetType, displayTargetId, outside.map(o => ({
             id: o.id,
             attrs: { x: Math.min(Math.max(0, o.x ?? 0), viewW - 100), y: Math.min(Math.max(0, o.y ?? 0), viewH - 60) },
         })), true);
         setSelectedIds(outside.map(o => o.id));
         toast.success(`${outside.length}件を画面内へ回収しました`);
     };
     ```
     `viewW/viewH` は 21 §A で導入する論理ビューポート（preset は 1200×800）。ペイン render 外で使うため、算出をコンポーネント上部（単一表示セル基準）へ移すか、`stableSize` から同式で再計算する。
  2. `NoteToolsSidebar` の PNG ボタンの下に `🧲 画面外を回収` ボタン（props `onGatherOutside` 追加）。
- **受入**: 広いウィンドウで右端に置いた図形 → 窓を縮める（見えなくなる）→ 回収ボタンで画面内に現れ、選択状態になる。Ctrl+Z で元の位置に戻せる。

## №21【中】Ctrl+C/X/V/Delete が body フォーカス限定

- **事象**: `src/hooks/useNoteKeyboard.ts`（grep: `if (e.target !== document.body) return;`）。ツールボタンや 1面/4面 セグメント等の**ボタンをクリックした直後はフォーカスがボタンに残り**、コピー等が無反応になる（「たまに効かない」の正体）。
- **修正**: 判定を「編集可能要素のみ除外」へ緩和:
  ```ts
  const t = e.target as HTMLElement | null;
  const tag = t?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
  ```
- **受入**: 「4面」ボタンをクリック→オブジェクトを選択→Ctrl+C→Ctrl+V が動く。テキスト編集中・線幅スライダー操作中（input）はショートカットが奪われない。

## №22【高】Note Canvas がタッチで操作不能（マーキー/図形ドラッグ/ペン）

- **事象**: `CanvasWorkspace` の Stage は `onMouseDown/onMouseMove/onMouseUp` のみバインドし、しかも先頭で `if (e.evt.button !== 0) return;`（TouchEvent に button は無く undefined ≠ 0 で常に return）。オブジェクトの `onTap` は効くため単体選択はできるが、**タッチではマーキー選択・図形のドラッグ作成・フリーハンドが動かない**（CLAUDE.md のタッチデバイス配慮に違反）。
- **修正**:
  1. ハンドラの型を `Konva.KonvaEventObject<MouseEvent | TouchEvent>` に広げ、button 判定を安全化:
     ```ts
     const isTouch = typeof TouchEvent !== 'undefined' && e.evt instanceof TouchEvent;
     if (!isTouch && (e.evt as MouseEvent).button !== 0) return;
     ```
     （`handleStageMouseDown` / `handleStageMouseMove` / `handleStageMouseUp` の3箇所。座標は `getRelativePointerPosition()` がタッチでも正しく返す）
  2. Stage に touch ハンドラを併設（grep: `onMouseDown={(e) => {`）:
     ```tsx
     onTouchStart={(e) => { …onMouseDown と同じ本文… }}
     onTouchMove={(e) => { …onMouseMove と同じ本文… }}
     onTouchEnd={(e) => { …onMouseUp と同じ本文… }}
     ```
     （既存の isGridMode ガードごと共通化のため、`buildStageHandlers(index, scale)` のような小さなファクトリにまとめてよい）
  3. `App.scss` の `.konvajs-content { touch-action: none; }` は設定済み（確認のみ）。
- **受入**: モバイル 375px（またはデスクトップのタッチエミュレーション）で、①ペンで線が描ける ②矩形をドラッグ作成できる ③空白からのドラッグでマーキー選択できる ④従来のタップ選択・ドラッグ移動が退行しない。マウス操作（右クリックメニュー含む）が退行しない。

## №23【中】LoadingScreen が固定暗色（セピアで暗転フラッシュ）

- **事象**: `src/components/common/LoadingScreen.tsx`（grep: `backgroundColor: '#1e1e1e'`）。セピアテーマではページ遷移のたびに**真っ暗な画面がフェードイン**して世界観が壊れる。文字も `#ccc` 固定。
- **修正**: `backgroundColor: 'var(--surface-1, #1e1e1e)'`、`color: 'var(--text-secondary, #ccc)'` に置換。
- **受入**: セピアでモード遷移するとセピア色のオーバーレイでフェードする。ダークは従来どおり。

## №24【中】モーダル群のハードコード暗色

- **事象**: `MergeModal.tsx`（`#1e1e1e/#111/#222/#333`）、`Modal.scss`（NodeEditModal/CharacterSelectModal が使用。L18-94 に `#1e1e1e/#2d2d2d/#444/#aaa/#fff`）、`FollowConfirmModal.tsx` が全て固定暗色。セピアでダイアログだけ暗黒のまま。
- **修正**: 21 §F の置換対応表に従い機械的に置換する。
  - `Modal.scss`: `#1e1e1e`→`var(--surface-1)` / `#2d2d2d`→`var(--surface-3)` / `#333,#444`(枠)→`var(--border-default)` / `#555`→`var(--border-strong)` / `#e0e0e0,#fff`→`var(--text-primary)` / `#aaa`→`var(--text-secondary)`。`#007acc/#ef4444` 系のボタンは据え置き。
  - `MergeModal.tsx` / `FollowConfirmModal.tsx` / `DialogHost.tsx`（タイトル `color:'#fff'` のみ）も同様。選択行の `backgroundColor: '#222'`→`var(--surface-3)`、選択中 `#007acc` は据え置き。
- **受入**: セピアで sync 合流モーダル・ノード編集・キャラ選択・同行確認・確認ダイアログを開き、面/文字がセピアで読める。ダークで従来と見た目同等。

## №25【中】オーバーレイ群の固定暗色 + 残存ハードコードの全域スイープ

- **事象**: `HelpDrawer.tsx`（`#1e1e1e/#252526/#333` 直書き多数）、`ShapeContextMenu.tsx`、`ImageGalleryWindow.tsx`、`ToastHost.tsx`、`NoteSearchBox.tsx`、`SaveStatusIndicator.tsx`、`PresetSelector.tsx`、`SpotlightTour.tsx`、`NoteView.scss` の非 Canvas 部分などに 21 §F 未対応の固定色が残る。
- **修正手順**（機械的に）:
  1. `grep -rn -E "#(111|141414|1a1a1a|1e1e1e|222|252526|2a2a2a|2d2d2d|333|3a3a3a|444|555|fff|ddd|ccc|aaa|999|888|777|666)\b" src/components src/styles --include='*.tsx' --include='*.scss'` で残存を列挙。
  2. 21 §F の対応表どおりに置換。**除外**: Konva ノード（`<Rect|<Line|<Arrow|<KonvaImage|<Text`（react-konva）への fill/stroke、紙面 `#ECD2B3`、方眼 SVG、`PRISON_POSITIONS` 線色、`MapObjectLayer`/`ReadOnlyMapView`/`MapElements` 内、`rgba(0,0,0,…)` のシャドウ/黒幕）。
  3. 置換後に両テーマで全ページ+ヘルプ+ツアーを目視。
- **受入**: 上記 grep の残存ヒットが「除外リスト該当のみ」になる。セピアでヘルプドロワー・右クリックメニュー・トースト・検索ボックスが読める。

## №26【低】会話/遭遇のアクセント色が直書き

- **事象**: 💬会話系 `#5fd0d0`/`#2fd0d0`/`#178c8c` が `EventList.tsx`・`AnimationTimeline.tsx`・`TimelineGantt.tsx` に分散直書き。将来のテーマ調整・色変更で漏れる。
- **修正**: `_tokens.scss` に `--talk: #2fd0d0; --talk-strong: #178c8c;` を追加し（⚇遭遇は既存 `--gold`）、3ファイルの該当色を `var(--talk)` / `var(--talk-strong)` に置換（明度違いの `#5fd0d0` も `var(--talk)` に統一してよい）。
- **受入**: イベント一覧/シークバー帯/ガントのドットの色が従来と同等で、トークン1箇所の変更で全部変わる。

## №27【中】handleTransition 中の例外で遷移ロックが永続 — **21 §B と同一**

- **事象**: `App.tsx` `handleTransition` で `action()`（enterMode→ビュー再マウント）が throw すると `transitionBusyRef.current = true` のまま**全ページ遷移が永久に無視**される。
- **修正**: 21 §B のコード（try/finally 入り）を適用済みであること。
- **受入**: 21 §B 受入に含む。DevTools で `enterMode` に一時的に throw を仕込んでも、次のクリックで遷移できる（ロック残留なし）。

## №28【低】初回 lazy 読込時にローディングが二重表示

- **事象**: `App.tsx` は遷移オーバーレイ（`overlays` 内）と `Suspense fallback={<LoadingScreen overlay />}` を独立に持つ。初回のモード切替（チャンク未取得）では**両方が同時にマウント**され、フェード状態のズレで二重にちらつく。
- **修正**: 遷移オーバーレイ表示中は fallback を出さない:
  ```tsx
  <Suspense fallback={overlayPhase === 'hidden' ? <LoadingScreen overlay /> : null}>
  ```
  （遷移由来のロードは遷移オーバーレイが覆う。リロード直後の直接ロードのみ fallback が出る）
- **受入**: キャッシュ無効化（DevTools Network Disable cache + Slow 3G）で Create→Note 初回遷移してもローディングが一枚だけ表示される。

## №29【中】ダイアログ表示中もグローバルキーが生きている

- **事象**: `DialogHost` は Escape/Enter しか奪わないため、確認ダイアログ表示中に Space（Animate 再生トグル）、Delete（Note オブジェクト削除）、W/S・A/D（ペイン/キャラ切替）、F1 以外の各種が**背後で発火**する。「削除しますか？」の背後で対象が変わる等、事故のもと。
- **修正**: グローバル keydown を持つ4箇所の先頭にガードを追加:
  ```ts
  if (useAppStore.getState().dialog) return;   // オーバーレイダイアログ表示中はグローバルキー無効
  ```
  対象: `useNoteKeyboard.ts` の `handleKeyDown` 先頭 / `AnimateView.tsx` の Space ハンドラ / `CreateView.tsx` の Ctrl+Z・Escape ハンドラ / `NoteView.tsx`（№15 実施後は useNoteKeyboard に統合されるので実質3箇所）。`useTutorial` の F1 は対象外（ヘルプはいつでも開けてよい）。
- **受入**: 削除確認ダイアログを開いたまま Space/Delete/W/S を押しても背後のアプリが反応しない。ダイアログを閉じると再び効く。

## №30【中】オブジェクトIDが `Date.now()` 依存で衝突し得る

- **事象**: `CanvasWorkspace.tsx` の `id: \`${type}_${Date.now()}\``（text/rect 系/line 系/image、grep: `_${Date.now()}`）は**同一ミリ秒内の連続生成で衝突**する（画像の連続ドロップ、テストの高速操作等）。ID 衝突すると選択・更新・Undo が別オブジェクトに波及する。※ 貼り付け（useNoteClipboard）は既に random 付きで対策済み。
- **修正**: `src/components/note/noteConstants.ts` に共通生成器を追加し、全ての `\`${…}_${Date.now()}\`` を置換:
  ```ts
  export const genObjId = (prefix: string): string =>
      `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  ```
  置換対象（grep: `Date.now()` in CanvasWorkspace.tsx）: `drawingShapeInfoRef` の id、`handleStageMouseUp` の `baseId`、text の `baseId`、image 即時配置、`handleDrop` の `img_`、`NoteView.tsx` の `default_char_`、`handleGroupSelected` の `group_`。
- **受入**: 画像2枚を同時ドロップ（または連続ドロップ）してもそれぞれ独立に選択・削除できる。`grep -n "_\${Date.now()}\`" src/components` のヒットが 0。

## №31【低】RouteDock の sync 表示が読めない（生フレーム・相手名なし）

- **事象**: `RouteDock.tsx`（grep: `{Math.round(sc.meetingTime)}fr`）が「1185fr · 1char」のような表示で、**いつ・誰と**合流するのか読めない。0711 #5（訪問選択）実装後は特に、確認手段が必要。
- **修正**:
  ```tsx
  <span className="route-dock__sync-meta">
      {formatTime(Math.max(0, sc.meetingTime))} · {sc.charIds.map(formatCharName).join('・')}
  </span>
  ```
  import: `formatTime`（utils/timeFormat）、`formatCharName`（utils/charName）。`title={…}` に同内容+「（n回目の訪問）」（`sc.occurrence !== undefined ? \`自分の${sc.occurrence + 1}回目の訪問\` : ''`）を付ける。WaypointPanel の同表示（grep 同文字列）も同様に置換。
- **受入**: sync 制約が「⏱ シャワールーム 00:20 · 二階堂ヒロ」のように読める。長い場合も折り返しでドックからはみ出さない。

## №32【低】プリセット切替でイベントのキャラ絞り込みが残留

- **事象**: `eventFilterChar`（Animate のイベント一覧絞り込み）はモード離脱時にクリアされる（`enterMode`）が、**プリセット切替ではクリアされない**。前プリセットにしか居ないキャラで絞り込んだまま切り替えると、一覧が「イベントはありません」になり原因が分からない。
- **修正**: `src/store/presetSlice.ts` `setActivePresetId`（grep: `setActivePresetId: (id) => set({ activePresetId: id })`）を
  ```ts
  setActivePresetId: (id) => set({ activePresetId: id, eventFilterChar: null }),
  ```
  に変更（SliceCreator は AppState 全体に set できる）。
- **受入**: キャラ絞り込み中にプリセットを切り替えると絞り込みが解除され、全イベントが表示される。

---

## 実施順（推奨）

1. **№5・№27**: 21.md（§E-1/§B）と同時に完了させる。
2. **№1→№2→№3→№4**（sync 時間計算の一貫化。共通ヘルパー `timeAtCumDist`/`getNodeVisitTimesAnchored` を №1 で作り、№2/№3 は置換のみ）→ 単体テスト追加: `timeAtCumDist` がアンカー2点時に線形按分と一致すること／3点アンカーで区間別速度になること。
3. **№6→№7→№8→№9→№10→№31**（useRouteEditor/presetSlice の整合性まわり。同ファイル集中のため連続で）。
4. **№13→№14→№16→№17→№21→№30**（CanvasWorkspace 選択/入力まわり）。
5. **№22**（タッチ対応。実機/エミュレーション検証込みで独立コミット）。
6. **№15→№29→№28→№11→№32→№12→№18→№19→№20**。
7. **№23→№24→№25→№26**（テーマ。21 §F の後に残存分として実施）。

各項目 1 コミット（関連の強い №1-4、№23-26 はまとめてよい）。コミットごとに `npx tsc --noEmit` / `npm run build` / `npx vitest run` を通すこと。
