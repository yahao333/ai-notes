import React, { useState, useEffect, useRef } from 'react';
import { GenerationStep, Character, WorldSetting, PlotPoint, ChapterContent, ProjectData, ModelProvider } from './types';
import { generateCharactersAndWorld, generateMainPlot, generateChapterOutlines, generateNextChapterOutlines, generateFullChapterContent, compressStoryHistory } from './services/geminiService';
import StepSetup from './components/StepSetup';
import StepCharacters from './components/StepCharacters';
import StepPlot from './components/StepPlot';
import StepWriting from './components/StepWriting';
import TitleGeneratorModal from './components/TitleGeneratorModal';
import SettingsModal from './components/SettingsModal';
import { Download, Upload, Save, FileJson, FilePlus, PenLine, Settings } from 'lucide-react';

const STORAGE_KEY = 'soulwriter_autosave_v1';

const App: React.FC = () => {
  // 核心状态
  const [step, setStep] = useState<GenerationStep>(GenerationStep.SETUP);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadedFromStorage, setIsLoadedFromStorage] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null); // null表示不在批量生成中

  // Data State
  const [prompt, setPrompt] = useState("重生回到十年前，觉醒了'万物增幅'系统，这一世我要在这个赛博朋克与古武并存的世界成为最强。");
  const [bookTitle, setBookTitle] = useState("");
  const [world, setWorld] = useState<WorldSetting | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [plot, setPlot] = useState<PlotPoint[]>([]);
  const [chapters, setChapters] = useState<ChapterContent[]>([]);
  const [batchSize, setBatchSize] = useState(5); // 默认批量生成5章
  const [storySummary, setStorySummary] = useState(""); // 剧情记忆摘要
  
  // Model Config State
  const [modelProvider, setModelProvider] = useState<ModelProvider>('google');
  const [googleModelName, setGoogleModelName] = useState("gemini-3-pro-preview");
  const [aliyunApiKey, setAliyunApiKey] = useState("");

  // UI State
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 自动保存与恢复逻辑 ---

  // 1. 初始化时加载数据
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed: ProjectData = JSON.parse(savedData);
        // 简单的版本检查
        if (parsed.version === 1) {
          console.log("检测到自动保存进度，正在恢复...");
          setStep(parsed.step);
          setPrompt(parsed.prompt || "");
          setBookTitle(parsed.bookTitle || "");
          setWorld(parsed.world);
          setCharacters(parsed.characters);
          setPlot(parsed.plot);
          setChapters(parsed.chapters);
          if (parsed.batchSize) setBatchSize(parsed.batchSize);
          if (parsed.storySummary) setStorySummary(parsed.storySummary);
          if (parsed.modelProvider) setModelProvider(parsed.modelProvider);
          if (parsed.googleModelName) setGoogleModelName(parsed.googleModelName);
          if (parsed.aliyunApiKey) setAliyunApiKey(parsed.aliyunApiKey);
        }
      } catch (e) {
        console.error("读取自动保存失败:", e);
      }
    }
    setIsLoadedFromStorage(true); // 标记加载尝试已完成
  }, []);

  // 2. 数据变化时自动保存
  useEffect(() => {
    // 只有在初始化加载完成后才开始保存，防止覆盖
    if (!isLoadedFromStorage) return;

    const data: ProjectData = {
      version: 1,
      step,
      prompt,
      bookTitle,
      world,
      characters,
      plot,
      chapters,
      batchSize,
      storySummary,
      modelProvider,
      googleModelName,
      aliyunApiKey
    };

    // 使用 debounce 或直接保存，这里数据量不大直接保存
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log("进度已自动保存");

  }, [step, prompt, bookTitle, world, characters, plot, chapters, batchSize, storySummary, modelProvider, googleModelName, aliyunApiKey, isLoadedFromStorage]);

  // 新建项目 (重置)
  const handleNewProject = () => {
    if (window.confirm("确定要新建项目吗？这将清除当前的故事进度，包括剧情记忆（但会保留您的API Key和模型设置）。")) {
      // 1. 重置核心数据状态
      setStep(GenerationStep.SETUP);
      setPrompt("重生回到十年前，觉醒了'万物增幅'系统，这一世我要在这个赛博朋克与古武并存的世界成为最强。"); // 恢复默认提示词
      setBookTitle("");
      setWorld(null);
      setCharacters([]);
      setPlot([]);
      setChapters([]);
      
      // 2. 显式清空剧情记忆/压缩摘要 (关键)
      setStorySummary(""); 
      
      // 3. 重置 UI 状态
      setIsLoading(false);
      setBatchProgress(null);
      
      // 4. 不需要清除 localStorage.removeItem，因为 React 状态更新后
      // 下方的 useEffect 会自动检测到变化，并将新的空状态（含保留的API Key）写入 localStorage 覆盖旧数据。
      // 这样既清空了缓存，又保留了用户的配置。
    }
  };

  // --- 业务逻辑 ---

  // Step 1 -> 2: Setup to Characters
  const handleSetupGenerate = async () => {
    setIsLoading(true);
    try {
      const data = await generateCharactersAndWorld(prompt, modelProvider, aliyunApiKey, googleModelName);
      setWorld(data.world);
      setCharacters(data.characters);
      setStep(GenerationStep.CHARACTERS);
    } catch (e: any) {
      alert(`生成失败: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2 -> 3: Characters to Plot
  const handleConfirmCharacters = async (updatedWorld: WorldSetting, updatedCharacters: Character[]) => {
    if (!updatedWorld || updatedCharacters.length === 0) return;
    
    setWorld(updatedWorld);
    setCharacters(updatedCharacters);

    setIsLoading(true);
    try {
      const data = await generateMainPlot(updatedWorld, updatedCharacters, modelProvider, aliyunApiKey, googleModelName);
      setPlot(data);
      setStep(GenerationStep.PLOT);
    } catch (e: any) {
      alert(`生成大纲失败: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3 -> 4: Plot to Chapter Outlines -> Writing
  const handleConfirmPlot = async () => {
    if (!world || characters.length === 0 || plot.length === 0) return;
    setIsLoading(true);
    try {
      // 初始生成数量也使用 batchSize
      const outlineData = await generateChapterOutlines(world, characters, plot, batchSize, modelProvider, aliyunApiKey, googleModelName);
      const initialChapters: ChapterContent[] = outlineData.map(o => ({
        outline: o,
        content: '',
        isGenerated: false
      }));
      setChapters(initialChapters);
      setStep(GenerationStep.WRITING);
    } catch (e: any) {
      alert(`生成细纲失败: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 仅续写后续章节大纲
  const handleAddChaptersOutline = async (count: number = 5, plotDirection?: string) => {
    if (!world || characters.length === 0 || plot.length === 0 || chapters.length === 0) return;
    
    setIsLoading(true);
    try {
      const lastChapter = chapters[chapters.length - 1];
      // 传递当前的剧情摘要，优化大纲连贯性
      const newOutlines = await generateNextChapterOutlines(
        world, 
        characters, 
        plot, 
        lastChapter.outline, 
        count, 
        storySummary,
        plotDirection, // 传递剧情指令
        modelProvider,
        aliyunApiKey,
        googleModelName
      );
      
      const newChapters: ChapterContent[] = newOutlines.map(o => ({
        outline: o,
        content: '',
        isGenerated: false
      }));

      setChapters(prev => [...prev, ...newChapters]);
    } catch (e: any) {
      console.error(e);
      alert(`续写章节大纲失败: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 批量生成后续章节（大纲 + 正文）
   */
  const handleBatchGenerateChapters = async (count: number = 5, plotDirection?: string) => {
    if (!world || characters.length === 0 || plot.length === 0 || chapters.length === 0) return;
    if (batchProgress) return; // 防止重复点击

    try {
      // 0. 自动压缩剧情 (新增优化)
      // 使用 settings 中的压缩逻辑，范围覆盖到最后一章
      setBatchProgress("正在回顾前文并生成记忆摘要...");
      const latestSummary = await compressStoryHistory(chapters, characters, chapters.length - 1, modelProvider, aliyunApiKey, googleModelName);
      setStorySummary(latestSummary); // 更新状态以备持久化
      
      // 1. 生成大纲
      setBatchProgress("基于最新记忆规划后续大纲...");
      const lastChapter = chapters[chapters.length - 1];
      
      // 传入最新的摘要
      const newOutlines = await generateNextChapterOutlines(
        world, 
        characters, 
        plot, 
        lastChapter.outline, 
        count,
        latestSummary,
        plotDirection, // 传递剧情指令
        modelProvider,
        aliyunApiKey,
        googleModelName
      );
      
      // 2. 创建占位章节并添加到状态
      const newChaptersPlaceholder: ChapterContent[] = newOutlines.map(o => ({
        outline: o,
        content: '',
        isGenerated: false
      }));
      
      // 先保存当前的章节数量，作为后续更新的起始索引
      const startIndex = chapters.length;
      
      // 更新 UI 显示出新的空章节
      setChapters(prev => [...prev, ...newChaptersPlaceholder]);

      // 3. 串行生成每一章的正文
      // 注意：这里我们不能直接用 chapters 状态，因为它是旧的闭包。
      // 我们需要构建一个临时的上下文链。
      let previousContent = lastChapter.content || lastChapter.outline.summary; 

      for (let i = 0; i < newChaptersPlaceholder.length; i++) {
        const currentChapterIndex = startIndex + i;
        const currentChapter = newChaptersPlaceholder[i];
        
        setBatchProgress(`正在撰写第 ${currentChapter.outline.chapterNumber} 章... (${i + 1}/${count})`);
        
        // 调用非流式生成接口
        const generatedContent = await generateFullChapterContent(
          currentChapter.outline,
          world,
          characters,
          previousContent,
          undefined, // additionalInstructions
          latestSummary, // 使用最新的记忆摘要
          modelProvider,
          aliyunApiKey,
          googleModelName
        );

        // 更新单个章节状态
        handleUpdateChapter(currentChapterIndex, generatedContent, true);
        
        // 更新上下文，为下一章做准备
        previousContent = generatedContent;
      }

      setBatchProgress(null);

    } catch (e: any) {
      console.error(e);
      alert(`批量生成过程中断: ${e.message}`);
      setBatchProgress(null);
    }
  };


  // 更新章节内容
  const handleUpdateChapter = (index: number, content: string, isGenerated: boolean) => {
    setChapters(prev => {
      const newChapters = [...prev];
      if (newChapters[index]) {
        newChapters[index] = {
          ...newChapters[index],
          content,
          isGenerated
        };
      }
      return newChapters;
    });
  };

  // 更新章节标题
  const handleUpdateChapterTitle = (index: number, title: string) => {
    setChapters(prev => {
      const newChapters = [...prev];
      if (newChapters[index]) {
        newChapters[index] = {
          ...newChapters[index],
          outline: {
            ...newChapters[index].outline,
            title
          }
        };
      }
      return newChapters;
    });
  };

  // 更新分组小结
  const handleUpdateGroupSummary = (index: number, summary: string) => {
      setChapters(prev => {
          const newChapters = [...prev];
          if (newChapters[index]) {
              newChapters[index] = {
                  ...newChapters[index],
                  outline: {
                      ...newChapters[index].outline,
                      groupSummary: summary
                  }
              }
          }
          return newChapters;
      })
  }

  // 删除分组小结
  const handleDeleteGroupSummary = (index: number) => {
      handleUpdateGroupSummary(index, "");
  };

  // 删除章节
  const handleDeleteChapter = (index: number) => {
      if (chapters.length <= 1) {
          alert("无法删除：至少需要保留一个章节。");
          return;
      }

      setChapters(prev => {
          // 1. 过滤掉删除的章节
          const newChapters = prev.filter((_, i) => i !== index);
          
          // 2. 重新编排章节号，保证连续性
          return newChapters.map((chap, i) => ({
              ...chap,
              outline: {
                  ...chap.outline,
                  chapterNumber: i + 1
              }
          }));
      });
  };

  // 导出项目
  const handleExport = () => {
    const data: ProjectData = {
      version: 1,
      step,
      prompt,
      bookTitle,
      world,
      characters,
      plot,
      chapters,
      batchSize,
      storySummary,
      modelProvider,
      googleModelName,
      aliyunApiKey
    };
    
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${bookTitle || 'soulwriter-project'}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 导入项目触发
  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  // 处理文件读取
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.version && json.step) {
          const data = json as ProjectData;
          setStep(data.step);
          setPrompt(data.prompt || "");
          setBookTitle(data.bookTitle || "");
          setWorld(data.world);
          setCharacters(data.characters);
          setPlot(data.plot);
          setChapters(data.chapters);
          if (data.batchSize) setBatchSize(data.batchSize);
          if (data.storySummary) setStorySummary(data.storySummary);
          if (data.modelProvider) setModelProvider(data.modelProvider);
          if (data.googleModelName) setGoogleModelName(data.googleModelName);
          if (data.aliyunApiKey) setAliyunApiKey(data.aliyunApiKey);
          alert("项目导入成功！");
        } else {
          alert("无效的项目文件格式");
        }
      } catch (error) {
        console.error("Import error", error);
        alert("文件解析失败");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100 font-sans selection:bg-indigo-500/30">
      <header className="border-b border-gray-800 bg-[#0d1117]/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
             {/* Logo */}
             <div className="font-bold text-xl tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2 cursor-pointer shrink-0" onClick={() => setStep(GenerationStep.SETUP)}>
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                  <FileJson size={20} />
                </div>
                <span className="hidden sm:inline">SoulWriter AI</span>
              </div>
              
              {/* Divider */}
              <div className="h-6 w-px bg-gray-700 mx-2 hidden sm:block"></div>

              {/* Book Title */}
              <button 
                onClick={() => setShowTitleModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors group max-w-[150px] sm:max-w-xs"
                title="点击修改书名"
              >
                <div className="text-sm font-bold text-gray-200 truncate">
                   {bookTitle || "未命名作品"}
                </div>
                <PenLine size={14} className="text-gray-500 group-hover:text-indigo-400 shrink-0" />
              </button>
          </div>
          
          
          <div className="flex items-center gap-4">
            {/* Steps Indicator (Desktop) */}
            <div className="hidden lg:flex gap-2 text-xs font-mono text-gray-500 mr-4">
              <span className={step === GenerationStep.SETUP ? 'text-indigo-400' : ''}>01.设定</span>
              <span>&gt;</span>
              <span className={step === GenerationStep.CHARACTERS ? 'text-indigo-400' : ''}>02.人物</span>
              <span>&gt;</span>
              <span className={step === GenerationStep.PLOT ? 'text-indigo-400' : ''}>03.大纲</span>
              <span>&gt;</span>
              <span className={step === GenerationStep.WRITING ? 'text-indigo-400' : ''}>04.正文</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 border-l border-gray-700 pl-4">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".json" 
                onChange={handleImport}
              />

              {/* Settings Button - 可见性：所有端可见 */}
              <button 
                onClick={() => setShowSettingsModal(true)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2 text-sm"
                title="设置"
              >
                <Settings size={20} />
              </button>
              
              {/* 新建项目按钮 */}
              <button 
                onClick={handleNewProject}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2 text-sm"
                title="新建项目 (清空进度)"
              >
                <FilePlus size={18} />
                <span className="hidden sm:inline">新建项目</span>
              </button>

              <button 
                onClick={triggerImport}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2 text-sm"
                title="导入项目"
              >
                <Upload size={18} />
                <span className="hidden sm:inline">导入</span>
              </button>
              
              <button 
                onClick={handleExport}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-indigo-300 border border-indigo-500/30 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                title="导出项目"
              >
                <Save size={18} />
                <span className="hidden sm:inline">保存</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {step === GenerationStep.SETUP && (
          <StepSetup 
            prompt={prompt}
            setPrompt={setPrompt}
            onGenerate={handleSetupGenerate} 
            isLoading={isLoading} 
          />
        )}
        
        {step === GenerationStep.CHARACTERS && world && (
          <StepCharacters 
            world={world} 
            characters={characters} 
            onConfirm={handleConfirmCharacters}
            isLoading={isLoading}
          />
        )}

        {step === GenerationStep.PLOT && (
          <StepPlot 
            plot={plot}
            onConfirm={handleConfirmPlot}
            isLoading={isLoading}
          />
        )}

        {step === GenerationStep.WRITING && world && (
          <StepWriting 
            chapters={chapters}
            world={world}
            characters={characters}
            onUpdateChapter={handleUpdateChapter}
            onUpdateTitle={handleUpdateChapterTitle}
            onUpdateGroupSummary={handleUpdateGroupSummary}
            onDeleteChapter={handleDeleteChapter}
            onDeleteGroupSummary={handleDeleteGroupSummary}
            onLoadMoreChapters={handleAddChaptersOutline}
            onBatchGenerate={handleBatchGenerateChapters}
            isLoadingMore={isLoading}
            batchProgress={batchProgress}
            batchSize={batchSize}
            storySummary={storySummary} // Pass summary
            googleModelName={googleModelName} // Pass model name prop
            modelProvider={modelProvider} // Pass model provider
            aliyunApiKey={aliyunApiKey} // Pass aliyun API key
          />
        )}
      </main>

      {/* Modals */}
      {showTitleModal && (
        <TitleGeneratorModal 
           currentTitle={bookTitle}
           onSelect={(t) => setBookTitle(t)}
           onClose={() => setShowTitleModal(false)}
           contextData={{ prompt, world, characters }}
        />
      )}

      {showSettingsModal && (
        <SettingsModal 
          batchSize={batchSize}
          onSaveBatchSize={setBatchSize}
          storySummary={storySummary}
          onSaveStorySummary={setStorySummary}
          chapters={chapters}
          characters={characters}
          modelProvider={modelProvider}
          onSaveModelProvider={setModelProvider}
          googleModelName={googleModelName}
          onSaveGoogleModelName={setGoogleModelName}
          aliyunApiKey={aliyunApiKey}
          onSaveAliyunApiKey={setAliyunApiKey}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
};

export default App;