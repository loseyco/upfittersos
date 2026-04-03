// Extracted out logic into standard generic component
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useReactFlow } from '@xyflow/react';
import { X, Plus } from 'lucide-react';

export function IdeaEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, markerEnd, data }: any) {
  const { setEdges } = useReactFlow();
  const [activePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 12 });

  return (
    <>
      <BaseEdge path={activePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(${labelX}px, ${labelY}px) translate(-50%, -50%)`,
            pointerEvents: 'all',
            zIndex: 1000
          }}
          className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity"
        >
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-700 p-1 rounded-lg shadow-xl group">
              <button
                className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800 text-zinc-400 hover:text-green-400 hover:bg-zinc-700 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  data?.onInsertNode?.(id);
                }}
                title="Insert Node"
              >
                 <Plus className="w-3.5 h-3.5" />
              </button>
    
              <button
                className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setEdges((edges) => edges.filter((edge) => edge.id !== id));
                  if (data?.onLabelDrag) data.onLabelDrag(); // Triggers sync
                }}
                title="Delete Connection"
              >
                 <X className="w-3.5 h-3.5" />
              </button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
