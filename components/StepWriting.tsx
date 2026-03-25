
import React, { useState, useEffect } from 'react';
import { ChapterContent, Character, WorldSetting, ModelProvider } from '../types';
import { streamChapterContent, generateBatchSummary } from '../services/geminiService';
import ChapterReader from './ChapterReader';
import { FileText, Play, CheckCircle, Menu, X, Edit, Save, PlusCircle, Loader2, Sparkles, ArrowDown, RefreshCw, RotateCcw, CornerDownLeft, Bookmark, Copy, Check, Trash2, AlertTriangle, Eye } from 'lucide-react';

interface Props {
  chapters: ChapterContent[];
  world: WorldSetting;
  characters: Character[];
  onUpdateChapter: (index: number, content: string, isGenerated: boolean) => void;
  onUpdateTitle: (index: number, title: string) => void;
  onUpdateGroupSummary: (index: number, summary: string) => void; 
  onDeleteChapter: (index: number) => void; // 新增：删除章节
  onDeleteGroupSummary: (index: number) => void; // 新增：删除卷标
  onLoadMoreChapters: (count: number, plotDirection?: string) => void;
  onBatchGenerate: (count: number, plotDirection?: string) => void;
  isLoadingMore: boolean;
  batchProgress: string | null;
  batchSize: number; // 新增：接收配置的数量
  storySummary: string; // 新增：剧情记忆
  googleModelName: string; // Add prop
  modelProvider: ModelProvider; // 新增：模型提供商
  aliyunApiKey: string; // 新增：阿里云 API Key
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
      className={`p-1 rounded-md hover:bg-gray-700/50 transition-colors inline-flex items-center justify-center shrink-0 ${copied ? 'text-green-400' : 'text-gray-500 hover:text-indigo-400'} ${className}`}
      title="复制内容"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
};

const StepWriting: React.FC<Props> = ({ 
  chapters, 
  world, 
  characters, 
  onUpdateChapter, 
  onUpdateTitle, 
  onUpdateGroupSummary,
  onDeleteChapter,
  onDeleteGroupSummary,
  onLoadMoreChapters, 
  onBatchGenerate,
  isLoadingMore,
  batchProgress,
  batchSize,
  storySummary,
  googleModelName,
  modelProvider,
  aliyunApiKey
}) => {
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false); 
  const [isEditing, setIsEditing] = useState(false);
  
  // Loading state specifically for generating group summaries
  // Key is the starting index of the group
  const [generatingSummaryIndices, setGeneratingSummaryIndices] = useState<number[]>([]);

  // 重写功能相关状态
  const [showRewriteModal, setShowRewriteModal] = useState(false);
  const [rewriteInstructions, setRewriteInstructions] = useState("");
  
  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'chapter' | 'summary';
    index: number;
    title?: string;
  }>({ isOpen: false, type: 'chapter', index: -1 });

  // 规则详情弹窗状态
  const [showRulesModal, setShowRulesModal] = useState(false);

  // 撤销历史记录
  const [undoHistory, setUndoHistory] = useState<Record<number, string>>({});

  // 章节跳转输入状态
  const [jumpInput, setJumpInput] = useState("");

  // 剧情走向控制
  const [plotDirection, setPlotDirection] = useState("");

  // 确保 activeChapterIndex 不越界
  useEffect(() => {
      if (chapters.length > 0 && activeChapterIndex >= chapters.length) {
          setActiveChapterIndex(Math.max(0, chapters.length - 1));
      }
  }, [chapters.length, activeChapterIndex]);

  const activeChapter = chapters[activeChapterIndex] || chapters[0]; // 防御性处理
  
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setIsEditing(false);
  }, [activeChapterIndex]);

  const handleGenerate = async () => {
    if (isGenerating || activeChapter.isGenerated) return;
    startGeneration();
  };

  const handleRewrite = async () => {
    if (isGenerating) return;
    
    if (activeChapter.content) {
      setUndoHistory(prev => ({
        ...prev,
        [activeChapterIndex]: activeChapter.content
      }));
    }

    setShowRewriteModal(false);
    startGeneration(rewriteInstructions);
    setRewriteInstructions("");
  };

  const handleUndoRewrite = () => {
    const prevContent = undoHistory[activeChapterIndex];
    if (!prevContent) return;

    if (window.confirm("确定要撤销重写，恢复到上一个版本吗？当前版本将丢失。")) {
      onUpdateChapter(activeChapterIndex, prevContent, true);
      setUndoHistory(prev => {
        const newState = { ...prev };
        delete newState[activeChapterIndex];
        return newState;
      });
    }
  };

  const handleJumpToChapter = () => {
    const target = parseInt(jumpInput);
    if (isNaN(target)) return;
    
    if (target < 1 || target > chapters.length) {
      alert(`请输入有效章节号 (1-${chapters.length})`);
      return;
    }

    setActiveChapterIndex(target - 1);
    setJumpInput("");
    if (window.innerWidth < 768) setShowSidebar(false);
  };

  const handleJumpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJumpToChapter();
    }
  };
  
  // 生成分组标题的逻辑
  const handleGenerateGroupSummary = async (startIndex: number) => {
    if (generatingSummaryIndices.includes(startIndex)) return;
    
    // 获取这5章
    const groupChapters = chapters.slice(startIndex, startIndex + 5).map(c => c.outline);
    if (groupChapters.length === 0) return;

    setGeneratingSummaryIndices(prev => [...prev, startIndex]);
    
    try {
        // 如果是 Google 渠道，强制使用 Flash 模型以提高总结生成速度
        const summaryModel = modelProvider === 'google' ? "gemini-3-flash-preview" : undefined;
        const summary = await generateBatchSummary(groupChapters, modelProvider, aliyunApiKey, summaryModel); 
        onUpdateGroupSummary(startIndex, summary);
    } catch (e) {
        console.error("生成卷标出错详情:", e);
        alert("生成卷标失败，请查看控制台日志以获取更多信息");
    } finally {
        setGeneratingSummaryIndices(prev => prev.filter(i => i !== startIndex));
    }
  };

  const startGeneration = async (instructions?: string) => {
    setIsGenerating(true);
    setIsEditing(false);
    
    if (window.innerWidth < 768) {
        setShowSidebar(false);
    }
    
    let prevContext = "";
    if (activeChapterIndex > 0) {
      const prevChap = chapters[activeChapterIndex - 1];
      prevContext = prevChap.content || prevChap.outline.summary;
    }

    try {
      if (instructions) {
         onUpdateChapter(activeChapterIndex, "", false); 
      }

      let fullText = "";
      await streamChapterContent(
        activeChapter.outline,
        world,
        characters,
        prevContext,
        (textChunk) => {
          fullText += textChunk;
          onUpdateChapter(activeChapterIndex, fullText, false);
        },
        instructions,
        storySummary,
        modelProvider, // 传递模型提供商
        aliyunApiKey,  // 传递 API Key
        googleModelName // 传递选择的 Google 模型 (用于正文生成，通常为 Pro)
      );
      
      onUpdateChapter(activeChapterIndex, fullText, true);

    } catch (e) {
      alert("生成中断，请重试");
    } finally {
      setIsGenerating(false);
    }
  };
  
  // --- 删除确认逻辑 ---
  const requestDeleteChapter = (index: number) => {
      setDeleteConfirm({
          isOpen: true,
          type: 'chapter',
          index: index,
          title: `第 ${chapters[index].outline.chapterNumber} 章`
      });
  };

  const requestDeleteSummary = (index: number, summary: string) => {
      setDeleteConfirm({
          isOpen: true,
          type: 'summary',
          index: index,
          title: summary || "当前卷标"
      });
  };

  const executeDelete = () => {
      if (deleteConfirm.type === 'chapter') {
          onDeleteChapter(deleteConfirm.index);
          // 如果删除的是当前选中的章节，且不是第一章，需要更新 activeIndex
          if (activeChapterIndex === deleteConfirm.index && activeChapterIndex > 0) {
              setActiveChapterIndex(Math.max(0, activeChapterIndex - 1));
          }
      } else {
          onDeleteGroupSummary(deleteConfirm.index);
      }
      setDeleteConfirm({ ...deleteConfirm, isOpen: false });
  };

  if (!activeChapter) return <div>数据加载中...</div>;

  const isBatchGenerating = batchProgress !== null;
  const canUndo = !!undoHistory[activeChapterIndex];

  return (
    <div className="flex h-[calc(100vh-100px)] overflow-hidden rounded-xl border border-gray-800 bg-gray-950 relative">
      
      {/* 统一的删除确认模态框 */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-gray-900 border border-red-500/30 rounded-xl p-6 w-full max-w-sm shadow-2xl flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-500">
                  <AlertTriangle size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                  确定要删除吗？
              </h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                  您即将删除 <span className="text-white font-bold">{deleteConfirm.title}</span>。
                  {deleteConfirm.type === 'chapter' && (
                      <span className="block mt-1 text-red-400 text-xs">注意：删除章节后，后续章节序号将自动前移，且无法撤销。</span>
                  )}
              </p>
              
              <div className="flex gap-3 w-full">
                  <button 
                    onClick={() => setDeleteConfirm({ ...deleteConfirm, isOpen: false })} 
                    className="flex-1 px-4 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    onClick={executeDelete} 
                    className="flex-1 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold shadow-lg shadow-red-900/30 transition-colors"
                  >
                    确认删除
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* 脉络与规则详情模态框 */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowRulesModal(false)}>
           <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl p-6 relative flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
              <button 
                  onClick={() => setShowRulesModal(false)}
                  className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
              >
                  <X size={20} />
              </button>
              
              <div className="border-b border-gray-800 pb-4 mb-4 shrink-0">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <FileText className="text-indigo-400" size={20} />
                      第{activeChapter.outline.chapterNumber}章创作指引
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{activeChapter.outline.title}</p>
              </div>

              <div className="space-y-6 overflow-y-auto custom-scrollbar pr-2">
                  {/* 爽点 */}
                  <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-500/30 rounded-lg p-4">
                      <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Sparkles size={12} />
                          核心爽点 (Cool Point)
                      </h4>
                      <p className="text-indigo-100 text-sm font-medium leading-relaxed">
                          {activeChapter.outline.coolPoint}
                      </p>
                  </div>

                  {/* 脉络 */}
                  <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">叙事脉络 (Narrative Pulse)</h4>
                      <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 text-gray-300 text-sm leading-relaxed">
                          {activeChapter.outline.narrativePulse}
                      </div>
                  </div>

                  {/* 规则 */}
                  <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">写作规则 (Rules)</h4>
                      <ul className="space-y-2">
                          {activeChapter.outline.rules.map((rule, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-gray-300 bg-gray-800/30 p-2 rounded border border-gray-700/30">
                                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                                  <span className="leading-relaxed">{rule}</span>
                              </li>
                          ))}
                      </ul>
                  </div>

                  {/* 梗概 */}
                   <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">本章梗概 (Summary)</h4>
                       <p className="text-gray-400 text-sm leading-relaxed border-l-2 border-gray-700 pl-3">
                          {activeChapter.outline.summary}
                      </p>
                  </div>
              </div>
              
              <div className="pt-4 mt-4 border-t border-gray-800 flex justify-end shrink-0">
                   <button 
                      onClick={() => setShowRulesModal(false)}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                   >
                      关闭
                   </button>
              </div>
           </div>
        </div>
      )}

      {/* 重写设置模态框 */}
      {showRewriteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
           <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2 shrink-0">
                  <RefreshCw className="text-indigo-400" size={20} />
                  重写本章
              </h3>
              
              <div className="overflow-y-auto mb-4 custom-scrollbar pr-2">
                 <div className="bg-gray-800/50 rounded-lg p-3 mb-4 border border-gray-700">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-1">当前大纲摘要</span>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {activeChapter.outline.summary}
                    </p>
                 </div>

                 <p className="text-sm text-gray-400 mb-2">
                     AI 将根据上述大纲重新撰写正文。您可以输入具体的修改意见，AI会重点关注。
                 </p>
              </div>

              <textarea 
                  className="w-full h-32 bg-gray-950 border border-gray-700 rounded-lg p-3 text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none placeholder-gray-600 text-sm shrink-0" 
                  placeholder="例如：这一章的打斗细节太少了，多描写一下招式；或者，女主的反应再害羞一点..."
                  value={rewriteInstructions}
                  onChange={(e) => setRewriteInstructions(e.target.value)}
                  autoFocus
              />
              <div className="flex justify-end gap-3 mt-6 shrink-0">
                  <button 
                    onClick={() => setShowRewriteModal(false)} 
                    className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-sm"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleRewrite} 
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/20 text-sm flex items-center gap-2"
                  >
                    <RefreshCw size={14} />
                    开始重写
                  </button>
              </div>
           </div>
        </div>
      )}

      {showSidebar && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden transition-opacity"
          onClick={() => setShowSidebar(false)}
        />
      )}

      <button 
        className="md:hidden fixed bottom-6 right-6 z-50 bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-full shadow-xl shadow-indigo-900/50 transition-all active:scale-95 flex items-center justify-center"
        onClick={() => setShowSidebar(!showSidebar)}
        title={showSidebar ? "关闭目录" : "打开目录"}
      >
        {showSidebar ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar - Chapter List */}
      <div className={`
        fixed md:relative z-40 w-72 max-w-[80vw] bg-gray-900 border-r border-gray-800 h-full flex flex-col transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none
        ${showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 border-b border-gray-800 bg-gray-900 font-bold text-gray-200 flex justify-between items-center shrink-0">
          <span>目录 ({chapters.length}章)</span>
          <button 
            onClick={() => setShowSidebar(false)}
            className="md:hidden text-gray-500 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-gray-800 bg-gray-900/50 shrink-0">
          <div className="flex gap-2">
            <input 
              type="number" 
              className="w-full bg-gray-950 border border-gray-700 rounded text-sm px-2 py-1 text-gray-300 focus:border-indigo-500 outline-none placeholder-gray-600"
              placeholder="前往章节..."
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              onKeyDown={handleJumpKeyDown}
              min={1}
              max={chapters.length}
            />
            <button 
              onClick={handleJumpToChapter}
              disabled={!jumpInput}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 hover:text-white px-2 rounded transition-colors disabled:opacity-50"
              title="跳转"
            >
              <CornerDownLeft size={16} />
            </button>
          </div>
        </div>
        
        {/* Scrollable List */}
        <div className="overflow-y-auto flex-1 p-2 space-y-2">
          {chapters.map((chap, idx) => (
            <React.Fragment key={idx}>
              {/* Group Summary Header (Every 5 chapters) */}
              {idx % 5 === 0 && (
                  <div className="mb-2 mt-4 first:mt-0">
                      <div className="bg-gray-800/80 border border-gray-700 rounded-lg p-2 flex items-center justify-between gap-2 shadow-sm group/header">
                          {chap.outline.groupSummary ? (
                              <>
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Bookmark size={14} className="text-yellow-500 shrink-0" />
                                    <span className="text-xs font-bold text-yellow-100/90 truncate" title={chap.outline.groupSummary}>
                                        {chap.outline.groupSummary}
                                    </span>
                                    <CopyBtn text={chap.outline.groupSummary} />
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        requestDeleteSummary(idx, chap.outline.groupSummary || "");
                                    }}
                                    className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-red-900/20 transition-colors shrink-0"
                                    title="删除卷标"
                                >
                                    <Trash2 size={12} />
                                </button>
                              </>
                          ) : (
                              <span className="text-xs text-gray-500 font-medium pl-1">第 {chap.outline.chapterNumber}-{Math.min(chap.outline.chapterNumber + 4, chapters[chapters.length-1].outline.chapterNumber)} 章</span>
                          )}
                          
                          <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateGroupSummary(idx);
                              }}
                              disabled={generatingSummaryIndices.includes(idx)}
                              className="text-gray-500 hover:text-indigo-400 p-1 rounded hover:bg-gray-700/50 transition-colors shrink-0"
                              title={chap.outline.groupSummary ? "重新生成卷标" : "生成卷标"}
                          >
                              {generatingSummaryIndices.includes(idx) ? (
                                  <Loader2 size={12} className="animate-spin" />
                              ) : (
                                  <Sparkles size={12} />
                              )}
                          </button>
                      </div>
                  </div>
              )}

              <div
                id={`chapter-item-${idx}`} 
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveChapterIndex(idx);
                  if (window.innerWidth < 768) setShowSidebar(false);
                }}
                onKeyDown={(e) => {
                   if (e.key === 'Enter' || e.key === ' ') {
                      setActiveChapterIndex(idx);
                      if (window.innerWidth < 768) setShowSidebar(false);
                   }
                }}
                className={`w-full text-left p-3 rounded-lg text-sm transition-all flex items-start gap-2 cursor-pointer group/item
                  ${activeChapterIndex === idx 
                    ? 'bg-indigo-900/40 border border-indigo-500/30 text-indigo-200' 
                    : 'hover:bg-gray-800 text-gray-400 border border-transparent'}
                `}
              >
                <div className="mt-0.5 shrink-0">
                  {chap.isGenerated ? <CheckCircle size={14} className="text-green-500" /> : <FileText size={14} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold truncate">第{chap.outline.chapterNumber}章: {chap.outline.title}</div>
                      <div className="flex items-center gap-1 shrink-0">
                         <CopyBtn 
                            text={`第${chap.outline.chapterNumber}章 ${chap.outline.title}`} 
                            className="shrink-0"
                         />
                         <button
                            onClick={(e) => {
                                e.stopPropagation();
                                requestDeleteChapter(idx);
                            }}
                            className="p-1.5 md:p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-all opacity-100 md:opacity-0 md:group-hover/item:opacity-100"
                            title="删除本章"
                         >
                            <Trash2 size={14} className="md:w-3 md:h-3" />
                         </button>
                      </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 truncate">{chap.outline.coolPoint}</div>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="p-3 border-t border-gray-800 bg-gray-900 shrink-0 space-y-2">
          <div className="mb-2">
             <label className="text-xs text-gray-500 font-bold mb-1 block flex justify-between items-center">
                <span>剧情走向控制 (可选)</span>
                {plotDirection && (
                    <span 
                        className="text-xs text-indigo-400 cursor-pointer hover:text-indigo-300" 
                        onClick={() => setPlotDirection("")}
                    >
                        清空
                    </span>
                )}
             </label>
             <textarea
                value={plotDirection}
                onChange={(e) => setPlotDirection(e.target.value)}
                placeholder="例如：主角在遗迹中获得了上古传承，遇到了魔教圣女..."
                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-gray-300 outline-none focus:border-indigo-500 resize-none h-16 placeholder-gray-700 custom-scrollbar"
             />
          </div>

          {isBatchGenerating && (
             <div className="text-xs text-indigo-400 flex items-center gap-2 bg-indigo-900/20 p-2 rounded mb-2">
                <Loader2 size={12} className="animate-spin" />
                {batchProgress}
             </div>
          )}

          <button
            onClick={() => onBatchGenerate(batchSize, plotDirection)}
            disabled={isLoadingMore || isBatchGenerating}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBatchGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                自动码字中...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                一键生成后续{batchSize}章
              </>
            )}
          </button>

           <button
            onClick={() => onLoadMoreChapters(batchSize, plotDirection)}
            disabled={isLoadingMore || isBatchGenerating}
            className="w-full py-2 rounded-lg border border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-indigo-500 hover:bg-gray-800 transition-all flex items-center justify-center gap-2 text-xs font-medium"
          >
            {isLoadingMore ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                推演中...
              </>
            ) : (
              <>
                <PlusCircle size={14} />
                仅生成后续{batchSize}章大纲
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-black/20">
        <div className="p-4 border-b border-gray-800 bg-gray-850 flex justify-between items-start md:items-center flex-col md:flex-row gap-4 shrink-0">
          <div 
            className="w-full md:w-auto cursor-pointer group"
            onClick={() => setShowRulesModal(true)}
            title="点击查看详细设定"
          >
             <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2 group-hover:text-indigo-400 transition-colors">
                本章脉络 & 规则
                <Eye size={14} className="opacity-50 group-hover:opacity-100 transition-opacity" />
             </h3>
             <p className="text-sm text-gray-300 line-clamp-2 md:line-clamp-1 group-hover:text-white transition-colors">
               <span className="text-indigo-400">[{activeChapter.outline.narrativePulse}]</span> {activeChapter.outline.rules.join(" | ")}
             </p>
          </div>
          
          <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
            {canUndo && !isGenerating && !isBatchGenerating && (
                <button
                    onClick={handleUndoRewrite}
                    className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-orange-400 border border-orange-500/30 transition-all flex items-center gap-2 text-sm md:text-base font-medium"
                    title="恢复重写前的内容"
                >
                    <RotateCcw size={16} />
                    <span className="hidden sm:inline">撤销重写</span>
                </button>
            )}

            {activeChapter.isGenerated && !isGenerating && !isBatchGenerating && (
                <button
                    onClick={() => setShowRewriteModal(true)}
                    className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-indigo-300 border border-indigo-500/30 transition-all flex items-center gap-2 text-sm md:text-base font-medium"
                    title="重写本章"
                >
                    <RefreshCw size={16} />
                    <span className="hidden sm:inline">重写</span>
                </button>
            )}

            {(activeChapter.content || activeChapter.isGenerated) && !isGenerating && !isBatchGenerating && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 font-bold transition-all border text-sm md:text-base
                  ${isEditing 
                    ? 'bg-green-600/20 text-green-400 border-green-500/50 hover:bg-green-600/30' 
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'
                  }`}
              >
                {isEditing ? (
                  <>
                    <Save size={16} />
                    <span className="hidden sm:inline">完成</span>
                  </>
                ) : (
                  <>
                    <Edit size={16} />
                    <span className="hidden sm:inline">修改</span>
                  </>
                )}
              </button>
            )}

            {(!activeChapter.isGenerated && !activeChapter.content) && (
              <button
                onClick={handleGenerate}
                disabled={isGenerating || isBatchGenerating}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-indigo-500/20 whitespace-nowrap text-sm md:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? '创作中...' : (isBatchGenerating ? '批量任务进行中...' : '生成正文')}
                {!isGenerating && !isBatchGenerating && <Play size={16} fill="currentColor" />}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-3xl mx-auto h-full pb-24">
             {isEditing ? (
               <div className="h-full min-h-[600px] bg-gray-900 p-4 md:p-8 rounded-xl border border-indigo-500/30 shadow-2xl flex flex-col animate-in fade-in duration-300">
                 <div className="mb-4 pb-4 border-b border-gray-800 flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs text-gray-500 uppercase tracking-wider font-bold">
                        <span>正在编辑: 第{activeChapter.outline.chapterNumber}章</span>
                        <span className={activeChapter.content.length > 2000 ? 'text-green-500' : 'text-gray-500'}>
                            {activeChapter.content.length} 字
                        </span>
                    </div>
                    <input 
                        type="text" 
                        value={activeChapter.outline.title}
                        onChange={(e) => onUpdateTitle(activeChapterIndex, e.target.value)}
                        className="bg-transparent text-xl md:text-2xl font-serif font-bold text-white border-b border-gray-700 focus:border-indigo-500 outline-none py-1 transition-colors placeholder-gray-700"
                        placeholder="输入章节标题..."
                    />
                 </div>
                 <textarea 
                   className="w-full flex-1 bg-transparent border-none outline-none text-gray-200 font-serif text-base md:text-lg leading-loose resize-none focus:ring-0"
                   value={activeChapter.content}
                   onChange={(e) => onUpdateChapter(activeChapterIndex, e.target.value, true)} 
                   placeholder="在此输入章节正文..."
                   spellCheck={false}
                   autoFocus
                 />
               </div>
             ) : (
               <>
                 <ChapterReader 
                   title={`第${activeChapter.outline.chapterNumber}章 ${activeChapter.outline.title}`}
                   content={activeChapter.content}
                   isStreaming={isGenerating && activeChapterIndex === chapters.findIndex(c => c === activeChapter)}
                 />
                 
                 <div className="mt-12 mb-8 text-center space-y-6">
                    {activeChapter.isGenerated && activeChapterIndex < chapters.length - 1 && (
                       <button
                         onClick={() => setActiveChapterIndex(prev => prev + 1)}
                         className="text-gray-400 hover:text-white underline decoration-indigo-500 underline-offset-4 py-4 px-8 text-lg transition-all flex items-center gap-2 mx-auto"
                       >
                         继续下一章
                         <ArrowDown size={16} />
                       </button>
                    )}

                    {activeChapter.isGenerated && activeChapterIndex === chapters.length - 1 && (
                        <div className="flex flex-col items-center justify-center gap-4 py-8 border-t border-gray-800/50">
                            <p className="text-gray-500 text-sm">当前剧情已至最新，是否继续推演后续发展？</p>
                            {/* 此处也允许输入剧情走向，虽然 UI 上已经在侧边栏提供了，但为了方便阅读流，这里可以只是一个快捷入口 */}
                            {plotDirection && (
                                <div className="bg-indigo-900/30 border border-indigo-500/30 px-4 py-2 rounded-lg text-sm text-indigo-300">
                                    <span className="font-bold mr-2">当前指定剧情:</span> {plotDirection}
                                </div>
                            )}

                            <button
                                onClick={() => onBatchGenerate(batchSize, plotDirection)}
                                disabled={isLoadingMore || isBatchGenerating}
                                className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold shadow-xl shadow-indigo-900/40 flex items-center gap-3 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                {isBatchGenerating ? (
                                    <>
                                        <Loader2 size={24} className="animate-spin" />
                                        <span className="text-lg">AI正在疯狂码字中...</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={24} />
                                        <span className="text-lg">一键生成后续{batchSize}章 (大纲+正文)</span>
                                    </>
                                )}
                            </button>
                            {!isBatchGenerating && (
                                <p className="text-xs text-gray-600">
                                    * 将根据当前剧情自动规划大纲并撰写正文
                                </p>
                            )}
                        </div>
                    )}
                 </div>
               </>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepWriting;