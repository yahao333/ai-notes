import React from 'react';
import { Loader2, BookOpen } from 'lucide-react';

interface Props {
  prompt: string;
  setPrompt: (value: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
}

const StepSetup: React.FC<Props> = ({ prompt, setPrompt, onGenerate, isLoading }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 px-4">
      <div className="space-y-4">
        <div className="bg-indigo-600 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/30">
          <BookOpen size={40} className="text-white" />
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
          AI 重生爽文生成器
        </h1>
        <p className="text-gray-400 max-w-lg mx-auto text-lg">
          输入一个简单的脑洞，AI 将为你构建完整的世界观、人设、大纲，并自动撰写逻辑严密的爽文章节。
        </p>
      </div>

      <div className="w-full max-w-2xl bg-gray-850 p-6 rounded-xl border border-gray-700 shadow-xl">
        <label className="block text-left text-sm font-medium text-gray-300 mb-2">
          核心脑洞 / 故事简介
        </label>
        <textarea
          className="w-full h-32 bg-gray-950 border border-gray-700 rounded-lg p-4 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none transition-all"
          placeholder="例如：重生之都市修仙，主角性格冷漠，杀伐果断..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isLoading}
        />
        <div className="mt-4 flex justify-end">
          <button
            onClick={onGenerate}
            disabled={isLoading || !prompt.trim()}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all shadow-lg shadow-indigo-900/50"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                正在构建世界...
              </>
            ) : (
              <>
                开始创作
                <BookOpen size={20} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StepSetup;