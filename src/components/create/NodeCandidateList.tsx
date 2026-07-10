import React from 'react';
import { MapNode } from '../../store';

interface NodeCandidateListProps {
    matchedNodes: MapNode[];
    otherNodes: MapNode[];
    selectedNodeId: string;
    onSelect: (node: MapNode) => void;
}

// U1: SuggestionSidebar(旧・右スライド)から一覧部のみを抽出した共通コンポーネント。
// RouteDock 内で suggestionTargetIndex!==null のときに自動展開して使う。
export const NodeCandidateList: React.FC<NodeCandidateListProps> = ({ matchedNodes, otherNodes, selectedNodeId, onSelect }) => (
    <div className="node-candidate-list">
        {matchedNodes.length === 0 && otherNodes.length === 0 && (
            <div className="node-candidate-list__empty">No named rooms.</div>
        )}

        {matchedNodes.map(node => (
            <NodeCandidateItem key={node.id} node={node} isSelected={selectedNodeId === node.id} onSelect={onSelect} />
        ))}

        {otherNodes.length > 0 && (
            <>
                {matchedNodes.length > 0 && (
                    <div className="node-candidate-list__divider">---------- others ----------</div>
                )}
                {otherNodes.map(node => (
                    <NodeCandidateItem key={node.id} node={node} isSelected={selectedNodeId === node.id} onSelect={onSelect} />
                ))}
            </>
        )}
    </div>
);

const NodeCandidateItem: React.FC<{ node: MapNode; isSelected: boolean; onSelect: (n: MapNode) => void }> = ({ node, isSelected, onSelect }) => (
    <div
        onClick={() => onSelect(node)}
        className={`node-candidate-list__item${isSelected ? ' is-selected' : ''}`}
    >
        <span className="node-candidate-list__item-name">{node.name}</span>
        <span className="node-candidate-list__item-floor">{node.floor}</span>
    </div>
);
