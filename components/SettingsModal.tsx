
import React, { useState } from 'react';
import { Settings, X, Save, AlertTriangle, FileText, Sparkles, Loader2, Check, Cpu, Key } from 'lucide-react';
import { ChapterContent, Character, ModelProvider } from '../types';
import { compressStoryHistory } from '../services/geminiService';

interface Props {
  batchSize: number;
  onSaveBatchSize: (size: number) => void;
  storySummary: string;
  onSaveStorySummary: (summary: string) => void;
  chapters: ChapterContent[];
  characters: Character[];
  modelProvider: ModelProvider;
  onSaveModelProvider: (provider: ModelProvider) => void;
  googleModelName: string;
  onSaveGoogleModelName: (name: string) => void;
  aliyunApiKey: string;
  onSaveAliyunApiKey: (key: string) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<Props> = ({ 
  batchSize, 
  onSaveBatchSize, 
  storySummary, 
  onSaveStorySummary,
  chapters,
  characters,
  modelProvider,
  onSaveModelProvider,
  googleModelName,
  onSaveGoogleModelName,
  aliyunApiKey,
  onSaveAliyunApiKey,
  onClose 
}) => {
  // Ensure initial size doesn't exceed new max of 5
  const [size, setSize] = useState(Math.min(batchSize, 5));
  
  // Compression State
  const [summary, setSummary] = useState(storySummary || "");
  const [compressTargetChapter, setCompressTargetChapter] = useState<number>(chapters.length > 0 ? chapters.length - 1 : 0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'model' | 'memory'>('general');

  // Model State
  const [localProvider, setLocalProvider] = useState<ModelProvider>(modelProvider);
  const [localGoogleModel, setLocalGoogleModel] = useState(googleModelName);
  const [localAliyunKey, setLocalAliyunKey] = useState(aliyunApiKey);

  const handleSave = () => {
    onSaveBatchSize(size);
    onSaveStorySummary(summary);
    onSaveModelProvider(localProvider);
    onSaveGoogleModelName(localGoogleModel);
    onSaveAliyunApiKey(localAliyunKey);
    onClose();
  };

  const handleCompress = async () => {
    if (chapters.length === 0) return;
    setIsCompressing(true);
    try {
        const result = await compressStoryHistory(
            chapters, 
            characters, 
            compressTargetChapter, 
            localProvider, 
            localAliyunKey,
            localGoogleModel
        );
        setSummary(result);
    } catch (e: any) {
        alert(`剧情压缩失败: ${e.message}`);
    } finally {
        setIsCompressing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-800 shrink-0">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings className="text-indigo-400" size={20} />
            生成设置
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 shrink-0">
             <button 
                onClick={() => setActiveTab('general')}
                className={`flex-1 py-3 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'general' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-white'}`}
             >
                通用设置
             </button>
             <button 
                onClick={() => setActiveTab('model')}
                className={`flex-1 py-3 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'model' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-white'}`}
             >
                模型设置
             </button>
             <button 
                onClick={() => setActiveTab('memory')}
                className={`flex-1 py-3 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'memory' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-white'}`}
             >
                剧情压缩
             </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          
          {activeTab === 'general' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-gray-300">
                    批量生成章节数量
                  </label>
                  <span className="text-indigo-400 font-bold text-lg">{size} 章</span>
                </div>
                
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  step="1"
                  value={size}
                  onChange={(e) => setSize(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                />
                
                <div className="flex justify-between text-xs text-gray-500 px-1">
                  <span>1章</span>
                  <span>3章</span>
                  <span>5章</span>
                </div>

                 <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400 leading-relaxed border border-gray-700 mt-4">
                    <p>提示：批量生成用于快速推进剧情。如果需要精细控制每一章的内容，建议在正文页面逐章生成。</p>
                 </div>
              </div>
          )}

          {activeTab === 'model' && (
              <div className="space-y-6">
                 <div className="space-y-3">
                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                        <Cpu size={16} className="text-indigo-400" />
                        AI 模型提供商
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => setLocalProvider('google')}
                            className={`p-3 rounded-lg border text-sm font-medium transition-all ${localProvider === 'google' ? 'bg-indigo-900/30 border-indigo-500 text-white shadow-md shadow-indigo-500/10' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'}`}
                        >
                            Google Gemini
                            <span className="block text-xs font-normal opacity-70 mt-1">系统默认</span>
                        </button>
                        <button 
                            onClick={() => setLocalProvider('aliyun')}
                            className={`p-3 rounded-lg border text-sm font-medium transition-all ${localProvider === 'aliyun' ? 'bg-indigo-900/30 border-indigo-500 text-white shadow-md shadow-indigo-500/10' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'}`}
                        >
                            阿里云百炼
                            <span className="block text-xs font-normal opacity-70 mt-1">通义千问 Max</span>
                        </button>
                    </div>
                 </div>

                 {localProvider === 'google' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="text-sm font-medium text-gray-300 block">选择 Google 模型版本</label>
                        <select 
                            value={localGoogleModel}
                            onChange={(e) => setLocalGoogleModel(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 text-sm"
                        >
                            <option value="gemini-3-pro-preview">Gemini 3 Pro (Preview) - 默认推荐</option>
                            <option value="gemini-3-flash-preview">Gemini 3 Flash (Preview) - 更快更省</option>
                        </select>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            * Pro 模型逻辑推理能力更强，适合复杂剧情规划；Flash 模型生成速度更快。
                        </p>
                    </div>
                 )}

                 {localProvider === 'aliyun' && (
                     <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                            <Key size={16} className="text-indigo-400" />
                            阿里云 API Key
                        </label>
                        <input 
                            type="password"
                            value={localAliyunKey}
                            onChange={(e) => setLocalAliyunKey(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder-gray-600 text-sm font-mono"
                            placeholder="sk-..."
                        />
                        <p className="text-xs text-gray-500 leading-relaxed">
                            * 请前往阿里云百炼控制台获取 API Key。该 Key 仅保存在您的浏览器本地存储中。
                        </p>
                     </div>
                 )}
              </div>
          )}

          {activeTab === 'memory' && (
              <div className="space-y-6">
                 <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-3 flex gap-2">
                    <Sparkles size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-indigo-200/80 leading-relaxed">
                        随着章节增多，AI 可能会遗忘前期剧情。通过“剧情压缩”，将前文浓缩为一份摘要，作为 AI 的长期记忆，确保后续剧情连贯，特别是男女主关系进展。
                    </p>
                 </div>

                 <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-300 block">压缩范围</label>
                     <div className="flex gap-2">
                        <select 
                            value={compressTargetChapter}
                            onChange={(e) => setCompressTargetChapter(parseInt(e.target.value))}
                            className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500"
                            disabled={chapters.length === 0}
                        >
                            {chapters.map((c, i) => (
                                <option key={i} value={i}>
                                    截止到：第 {c.outline.chapterNumber} 章 {c.outline.title}
                                </option>
                            ))}
                        </select>
                        <button 
                            onClick={handleCompress}
                            disabled={isCompressing || chapters.length === 0}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shrink-0 transition-colors"
                        >
                            {isCompressing ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                            {isCompressing ? '分析中...' : '生成摘要'}
                        </button>
                     </div>
                 </div>

                 <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-300 flex justify-between">
                         <span>当前记忆摘要</span>
                         <span className="text-xs text-gray-500">{summary.length} 字</span>
                     </label>
                     <textarea 
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                        className="w-full h-48 bg-gray-950 border border-gray-700 rounded-lg p-3 text-gray-300 text-sm leading-relaxed outline-none focus:border-indigo-500 resize-none custom-scrollbar"
                        placeholder="暂无摘要。点击上方按钮生成，或手动输入..."
                     />
                     <p className="text-xs text-gray-500">
                         * 您可以手动修改这份摘要，补充被 AI 遗漏的关键信息。
                     </p>
                 </div>
              </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex justify-end">
          <button 
            onClick={handleSave}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg shadow-indigo-900/50"
          >
            <Save size={18} />
            保存全部设置
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
