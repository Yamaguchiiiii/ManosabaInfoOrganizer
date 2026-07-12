import { MapNode, CharacterTimelineData } from '../store';
import { getNodeVisitTimes, resolveStartTimes, precomputePath, computeAnchors } from './animationUtils';
import { MOVEMENT_SPEED_PX_PER_SEC, TARGET_FPS } from '../constants';
import { formatCharName } from './charName';

// sync 設定の整合性チェック（refactoring B-5）。
// resolveStartTimes / computeAnchors が矛盾を「無警告でフォールバック」してしまうため、
// 保存時に人間へ問題を提示して、原因不明の「ずれ」「長時間待機」を予防する。
export interface SyncIssue {
    level: 'error' | 'warn';
    charId: string; // 空文字はプリセット全体に関する指摘
    message: string;
}

const speedPerFrame = MOVEMENT_SPEED_PX_PER_SEC / TARGET_FPS;

export const validatePresetSync = (
    data: Record<string, CharacterTimelineData>,
    nodes: MapNode[]
): SyncIssue[] => {
    const issues: SyncIssue[] = [];
    const charIds = Object.keys(data);

    // 1. startRef 循環検出（DFS）。sync 制約があるキャラは startRef を無視するため対象外。
    const state: Record<string, 0 | 1 | 2> = {}; // 0=未訪問 1=訪問中 2=完了
    const hasSync = (id: string) => Array.isArray(data[id]?.syncConstraints) && data[id].syncConstraints!.length > 0;
    const dfs = (id: string, path: string[]) => {
        if (state[id] === 1) {
            const start = path.indexOf(id);
            const chain = [...path.slice(start), id].map(formatCharName).join(' → ');
            issues.push({ level: 'error', charId: id, message: `開始条件が循環しています: ${chain}` });
            return;
        }
        if (state[id] === 2) return;
        const ref = data[id]?.startRef;
        if (!ref || !ref.charId || hasSync(id) || !data[ref.charId] || ref.charId === id) { state[id] = 2; return; }
        state[id] = 1;
        dfs(ref.charId, [...path, id]);
        state[id] = 2;
    };
    charIds.forEach(id => { if (state[id] !== 2) dfs(id, []); });

    // 2. 参照切れ
    charIds.forEach(id => {
        const cd = data[id];
        const ref = cd.startRef;
        if (ref && ref.charId) {
            if (!data[ref.charId]) {
                issues.push({ level: 'error', charId: id, message: `開始条件の基準キャラ「${formatCharName(ref.charId)}」が存在しません。` });
            } else if (ref.nodeId) {
                const visits = getNodeVisitTimes({ ...data[ref.charId], startTime: 0 }, ref.nodeId, nodes);
                if (visits.length === 0) {
                    issues.push({ level: 'warn', charId: id, message: `基準キャラ「${formatCharName(ref.charId)}」が指定地点を通らないため、開始条件が無視されます。` });
                } else if ((ref.occurrence || 0) >= visits.length) {
                    issues.push({ level: 'warn', charId: id, message: `開始条件の訪問回数(${(ref.occurrence || 0) + 1}回目)が多すぎます（実際は${visits.length}回まで）。` });
                }
            }
        }
        (cd.syncConstraints || []).forEach(sc => {
            sc.charIds.forEach(cid => {
                if (!data[cid]) issues.push({ level: 'error', charId: id, message: `合流相手「${formatCharName(cid)}」が存在しません。` });
            });
            if (!cd.path.includes(sc.waypointId)) {
                issues.push({ level: 'warn', charId: id, message: `合流地点「${sc.waypointName}」が自分の経路上にありません。` });
            }
        });
    });

    // 3. 物理的に不可能な合流（区間の要求速度が通常の3倍超）
    const resolved = resolveStartTimes(data, nodes);

    // 3a. 過去向きの合流（アンカーが無効化される制約）を error で明示。0711 最重要3
    charIds.forEach(id => {
        const syncs = data[id].syncConstraints;
        if (!syncs || syncs.length === 0) return;
        const cd = { ...data[id], startTime: resolved[id] ?? data[id].startTime ?? 0 };
        const cached = precomputePath(cd.path, nodes);
        const mapped = syncs.map(sc => {
            const occ = sc.occurrence ?? 0;
            let count = 0, idx = -1;
            for (let i = 0; i < cached.pathNodes.length; i++) {
                if (cached.pathNodes[i].id === sc.waypointId) { if (count === occ) { idx = i; break; } count++; }
            }
            if (idx === -1) idx = cached.pathNodes.findIndex(n => n.id === sc.waypointId);
            return { idx, sc };
        }).filter(m => m.idx > 0).sort((a, b) => a.idx - b.idx);
        let prevTime = cd.startTime ?? 0;
        let prevCum = 0;
        for (const { idx, sc } of mapped) {
            const cum = cached.cumulative[idx] ?? cached.totalDistance;
            if (cum <= prevCum + 0.001) continue;
            if (sc.meetingTime <= prevTime) {
                issues.push({ level: 'error', charId: id,
                    message: `「${sc.waypointName}」の合流時刻(${Math.round(sc.meetingTime)}fr)が直前の予定より過去のため無効化されます。syncを設定し直してください。` });
                continue;
            }
            prevTime = sc.meetingTime; prevCum = cum;
        }
    });

    // 3b. 合流時刻に相手が地点に居ない（相手の経路を後から変えた場合のスタレ検出を兼ねる）
    charIds.forEach(id => {
        (data[id].syncConstraints || []).forEach(sc => {
            sc.charIds.forEach(cid => {
                if (!data[cid]) return; // 参照切れは既存チェック(2)が出す
                const visits = getNodeVisitTimes({ ...data[cid], startTime: resolved[cid] ?? data[cid].startTime ?? 0 }, sc.waypointId, nodes);
                const TOL = 60; // 1秒の許容
                const ok = visits.some(v => sc.meetingTime >= v.arrival - TOL && sc.meetingTime <= v.departure + TOL);
                if (!ok) issues.push({ level: 'warn', charId: id,
                    message: `「${sc.waypointName}」の合流時刻に ${formatCharName(cid)} はその地点に居ません（相手の経路が変わった可能性）。` });
            });
        });
    });

    charIds.forEach(id => {
        const cd = { ...data[id], startTime: resolved[id] ?? data[id].startTime ?? 0 };
        const cached = precomputePath(cd.path, nodes);
        const anchors = computeAnchors(cd, cached);
        for (let i = 1; i < anchors.length; i++) {
            const dCum = anchors[i].cumDist - anchors[i - 1].cumDist;
            const dT = anchors[i].time - anchors[i - 1].time;
            if (dT > 0 && dCum > 0) {
                const reqSpeed = dCum / dT;
                if (reqSpeed > speedPerFrame * 3) {
                    issues.push({ level: 'warn', charId: id, message: `合流に間に合わせるため移動が速すぎます（通常の約${(reqSpeed / speedPerFrame).toFixed(1)}倍）。瞬間移動に見える可能性があります。` });
                    break;
                }
            }
        }
    });

    // 4. 全体開始オフセット（誰も動かない待機が長い）
    const starts = Object.values(resolved).filter(t => Number.isFinite(t));
    if (starts.length > 0) {
        const minStart = Math.min(...starts);
        if (minStart > 600) {
            issues.push({ level: 'warn', charId: '', message: `再生開始から約${Math.round(minStart / TARGET_FPS)}秒間、誰も動きません。開始条件を見直すとよいかもしれません。` });
        }
    }

    return issues;
};
