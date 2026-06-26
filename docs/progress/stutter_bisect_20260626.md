# カクツキ原因切り分け（bisect）メモ — 2026-06-26

## ★解決：真因は (A)(B) ではなく「persist の IndexedDB 書き込み」だった
Chrome の Performance を採取したところ、**`setItem`(store.ts) / `put`(IndexedDB) が 100%**、
JS heap が 400MB まで階段状→急落を反復（巨大 state の直列化・コピーの繰り返し）。
原因: **Zustand `persist` が「あらゆる `useAppStore.setState`」で全 state を IndexedDB へ書く**。
再生ループは `currentTime` を **4フレームに1回（≈15回/秒）** store に書くため、
セッション中に保存データ（経路・ノート）が増えるほど1回の書き込みが重くなり、
毎フレーム巨大 state を IndexedDB に書く → フレーム落ち＋GC圧。
（Tauri/WebView2 は IndexedDB 書き込みが軽く、症状が出にくかった。cache/LERP は無関係＝red herring）

### 修正（実施）
`currentTime` / `isPlaying` / `playbackSpeed` を **永続化しない別ストア `usePlaybackStore`** に分離。
再生は IndexedDB / 全 state 直列化に一切触れなくなった。
→ `store.ts`（usePlaybackStore 新設・useAppStore から playback 撤去）,
   `useAnimationPositions.ts`, `AnimationTimeline.tsx`。

> 下記の (A)(B) bisect 手順は**不要になった**（真因が別だったため）。cache/LERP は
> 現状リバート済みのまま。Edge最適化として戻したくなったら下記コードで再適用可。

---
（以下は当時の bisect 計画・参考）



## 状況
- 「Chrome すごくなめらか」を確認したのは **第1次カクツキ修正（seek誤検出除去・差分更新ガード・
  影除去/画像1枚化・currentVisualPositions インプレース化）まで**の状態。
- その**後**に Edge 対策として **(A) アイコン `cache()` ビットマップ化** と
  **(B) 時間ベースLERP** を追加 → これらが commit `663cf66` に同梱されている。
- `git diff 663cf66 -- 描画系ファイル` は空＝**描画コードはsmoothコミットと現在で同一**。
  smooth以降の描画変更は (A)(B) のみ。3-2/#4b/#5 は描画ループ非接触。
- → **再カクツキの容疑は (A)(B) の2つだけ**。これらを外して smooth に戻し、1つずつ戻して特定する。

## 切り分け手順
1. (A)(B) 両方を外す → Chrome で確認（smoothに戻るはず）。
2. (B) 時間ベースLERP だけ戻す → 確認。
3. (A) cache だけ戻す → 確認。
4. カクついた方が原因。

---

## (A) アイコン `cache()` ビットマップ化 — `src/components/AnimateView.tsx` `MovingCharIcon`

戻す（再適用する）には、`MovingCharIcon` を以下にする:

```tsx
const MovingCharIcon = React.memo(React.forwardRef<Konva.Group, { icon: string, x: number, y: number }>(
    ({ icon, x, y }, ref) => {
        const [image] = useImage(`./icon/${icon}`);
        const imgRef = useRef<Konva.Image>(null);

        useEffect(() => {
            const node = imgRef.current;
            if (image && node) {
                node.cache({ pixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
                node.getLayer()?.batchDraw();
            }
        }, [image]);

        return (
            <Group ref={ref} x={x} y={y}>
                <KonvaImage
                    ref={imgRef}
                    image={image}
                    width={ICON_SIZE} height={ICON_SIZE}
                    offsetX={HALF_SIZE} offsetY={HALF_SIZE}
                    cornerRadius={HALF_SIZE}
                    stroke="rgba(255, 255, 255, 0.85)" strokeWidth={2.5}
                />
            </Group>
        );
    }
));
```

smooth版（cacheなし）は `imgRef` と `useEffect(cache)` を消し、`<KonvaImage>` から `ref={imgRef}` を外すだけ。

---

## (B) 時間ベースLERP — `src/hooks/useAnimationPositions.ts`

再適用するには3箇所:

1. 定数（`const ICON_SIZE = 80;` の直後、`const LERP_FACTOR = 0.15;` を置換）:
```ts
const LERP_RATE = 10; // 60fps(dt≈1/60)で 1-exp(-10/60)≈0.154 ≒ 従来の固定0.15
```

2. ref 追加（`lastTsRef` の直後）:
```ts
const lastFrameTsRef = useRef<number | null>(null);
```

3. animate() 内、`const currentTime = timeRef.current;` の直後に:
```ts
const frameDt = lastFrameTsRef.current !== null
    ? Math.min((timestamp - lastFrameTsRef.current) / 1000, 0.1)
    : 1 / TARGET_FPS;
lastFrameTsRef.current = timestamp;
const lerpFactor = 1 - Math.exp(-LERP_RATE * frameDt);
```

4. LERP 適用箇所を `lerpFactor` に:
```ts
newX = prev.x + diffX * lerpFactor;
newY = prev.y + diffY * lerpFactor;
```

smooth版（固定LERP）は `const LERP_FACTOR = 0.15;` に戻し、上記の frameDt/lerpFactor/lastFrameTsRef を消し、
`newX = prev.x + diffX * LERP_FACTOR;` `newY = prev.y + diffY * LERP_FACTOR;` にする。

---

## 仮説（私見）
**(B) 時間ベースLERP が本命**。固定0.15は毎フレーム一定割合で追従するため、わずかなフレーム間隔の
ゆらぎを「ならして」滑らかに見せる。時間ベースは長いフレームで多く追従＝ヒッチ時に視覚が
ガクッと動くため、Chromeの微小なフレーム揺らぎで前後の小刻みな揺れに見える可能性がある。
(A) cache は通常コスト減のはずだが、pixelRatio やヒットグラフ生成で悪化する可能性も一応残す。
</content>
