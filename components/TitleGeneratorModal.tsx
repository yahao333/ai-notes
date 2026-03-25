import React, { useState } from 'react';
import { Loader2, Sparkles, X, Check, Book } from 'lucide-react';
import { generateBookTitles } from '../services/geminiService';
import { WorldSetting, Character } from '../types';

interface Props {
  currentTitle: string;
  onSelect: (title: string) => void;
  onClose: () => void;
  contextData: {
    prompt: string;
    world: WorldSetting | null;
    characters: Character[];
  };
}

const TitleGeneratorModal: React.FC<Props> = ({ currentTitle, onSelect, onClose, contextData }) => {
  const [inputValue, setInputValue] = useState(currentTitle);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const titles = await generateBookTitles(contextData.prompt, contextData.world, contextData.characters);
      setSuggestions(titles);
    } catch (e) {
      console.error(e);
      alert("AI 脑洞枯竭了，请重试");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    onSelect(inputValue);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-800">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Book className="text-indigo-400" size={20} />
            作品书名设定
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Input Section */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400 font-medium">当前书名</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="请输入书名，例如：重生之..."
                className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-600"
              />
              <button 
                onClick={handleSave}
                disabled={!inputValue.trim()}
                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Check size={18} />
                确定
              </button>
            </div>
          </div>

          {/* AI Generator Section */}
          <div className="pt-6 border-t border-gray-800">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-gray-400 font-medium flex items-center gap-2">
                <Sparkles size={14} className="text-yellow-400" />
                AI 灵感推荐
              </span>
              <button 
                onClick={handleGenerate}
                disabled={isGenerating}
                className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-900/30 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
              >
                {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {suggestions.length > 0 ? '换一批' : '一键生成'}
              </button>
            </div>

            {isGenerating ? (
              <div className="py-8 text-center text-gray-500 flex flex-col items-center gap-3">
                <Loader2 size={24} className="animate-spin text-indigo-500" />
                <p className="text-xs">正在分析人设与剧情，构思爆款书名...</p>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                {suggestions.map((title, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInputValue(title)}
                    className="text-left px-4 py-3 rounded-lg bg-gray-800 hover:bg-indigo-900/40 border border-transparent hover:border-indigo-500/50 transition-all text-sm text-gray-200 group flex justify-between items-center"
                  >
                    {title}
                    <span className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">使用此名</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-600 border border-dashed border-gray-800 rounded-lg bg-gray-900/50">
                <p className="text-sm">还没有灵感？点击上方按钮让 AI 帮你起名</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TitleGeneratorModal;