import React, { useState } from 'react';
import { PlotPoint } from '../types';
import { Map, ArrowRight, Flag, Copy, Check } from 'lucide-react';

interface Props {
  plot: PlotPoint[];
  onConfirm: () => void;
  isLoading: boolean;
}

const CopyBtn = ({ text, className = "" }: { text: string, className?: string }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button 
      onClick={handleCopy} 
      className={`ml-2 p-1.5 rounded-md hover:bg-gray-700/50 transition-colors inline-flex items-center justify-center shrink-0 ${copied ? 'text-green-400' : 'text-gray-500 hover:text-indigo-400'} ${className}`}
      title="复制内容"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
};

const StepPlot: React.FC<Props> = ({ plot, onConfirm, isLoading }) => {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex justify-between items-center border-b border-gray-800 pb-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Map className="text-green-400" />
          故事主线大纲
        </h2>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50"
        >
          {isLoading ? '规划章节中...' : '确认并生成细纲'}
          {!isLoading && <ArrowRight size={18} />}
        </button>
      </div>

      <div className="space-y-0 relative">
        {/* 垂直连接线 */}
        <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-gray-700"></div>

        {plot.map((point, idx) => (
          <div key={idx} className="relative pl-16 py-4">
            {/* 时间轴点 */}
            <div className="absolute left-3 top-6 w-6 h-6 rounded-full bg-gray-900 border-4 border-indigo-500 z-10"></div>
            
            <div className="bg-gray-850 p-5 rounded-lg border border-gray-700 hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold bg-gray-700 text-gray-300 px-2 py-1 rounded uppercase">
                    阶段 {idx + 1}
                  </span>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    {point.phase}
                    {idx === plot.length - 1 && <Flag size={16} className="text-red-400" />}
                  </h3>
                </div>
                <CopyBtn text={`阶段：${point.phase}\n剧情：${point.summary}`} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-gray-300 leading-relaxed pr-8">
                {point.summary}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StepPlot;