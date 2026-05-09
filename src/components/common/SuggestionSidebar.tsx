import React from 'react';
import { MapNode } from '../../store';

interface SuggestionSidebarProps {
  isOpen: boolean;
  targetType: 'start' | 'end' | null;
  matchedNodes: MapNode[]; // ▼ 追加: 検索一致
  otherNodes: MapNode[];   // ▼ 追加: その他
  selectedNodeId: string;
  onSelect: (node: MapNode) => void;
  onClose: () => void;
}

export const SuggestionSidebar = React.memo<SuggestionSidebarProps>(({ 
    isOpen, targetType, matchedNodes, otherNodes, selectedNodeId, onSelect, onClose 
}) => {
  return (
    <div 
      style={{
          // ▼▼▼ 修正: absoluteをやめ、幅遷移アニメーションを設定 ▼▼▼
          width: isOpen ? '250px' : '0px',
          minWidth: isOpen ? '250px' : '0px', // Flexboxでの潰れ防止
          height: '100%',
          backgroundColor: '#1e1e1e', 
          borderLeft: isOpen ? '1px solid #444' : 'none',
          transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 20, 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden', // 幅0のときに中身を隠す
          whiteSpace: 'nowrap' // アニメーション中の改行崩れ防止
      }}
      // サイドバー上でのイベント伝播防止
      onMouseDown={e => e.stopPropagation()} 
      onClick={e => e.stopPropagation()}
    >
        <div style={{ padding: '15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '51px' }}>
            <span style={{ fontWeight: 'bold', color: '#ccc' }}>
                Select {targetType === 'start' ? 'Start' : 'End'}
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {matchedNodes.length === 0 && otherNodes.length === 0 && (
                <div style={{ color: '#666', fontSize: '0.85rem', textAlign: 'center', marginTop: '20px' }}>No named rooms.</div>
            )}

            {/* ▼▼▼ 一致項目の表示 ▼▼▼ */}
            {matchedNodes.map(node => (
                <SuggestionItem key={node.id} node={node} isSelected={selectedNodeId === node.id} onSelect={onSelect} />
            ))}

            {/* ▼▼▼ 区切り線とその他の表示 (検索時のみ) ▼▼▼ */}
            {otherNodes.length > 0 && (
                <>
                    {matchedNodes.length > 0 && (
                        <div style={{ color: '#555', textAlign: 'center', margin: '10px 0', fontSize: '0.8rem' }}>
                            ---------- others ----------
                        </div>
                    )}
                    {otherNodes.map(node => (
                        <SuggestionItem key={node.id} node={node} isSelected={selectedNodeId === node.id} onSelect={onSelect} />
                    ))}
                </>
            )}
        </div>
    </div>
  );
});

// リストアイテム用サブコンポーネント
const SuggestionItem = ({ node, isSelected, onSelect }: { node: MapNode, isSelected: boolean, onSelect: (n: MapNode) => void }) => (
    <div 
      onClick={() => onSelect(node)}
      style={{ 
          padding: '8px 12px', marginBottom: '5px', borderRadius: '4px', cursor: 'pointer', 
          background: isSelected ? '#007acc' : '#333',
          color: 'white', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}
    >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
        <span style={{ fontSize: '0.75rem', color: '#aaa', background: '#222', padding: '2px 6px', borderRadius: '10px', marginLeft: '8px' }}>
            {node.floor}
        </span>
    </div>
);