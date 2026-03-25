import React, { useState, useEffect } from 'react';
import { Character, WorldSetting } from '../types';
import { User, Shield, Zap, Globe, ArrowRight, Copy, Check, Trash2 } from 'lucide-react';

interface Props {
  world: WorldSetting;
  characters: Character[];
  onConfirm: (updatedWorld: WorldSetting, updatedCharacters: Character[]) => void;
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

const StepCharacters: React.FC<Props> = ({ world, characters, onConfirm, isLoading }) => {
  const [editableWorld, setEditableWorld] = useState<WorldSetting>(world);
  const [editableCharacters, setEditableCharacters] = useState<Character[]>(characters);

  // 当外部传入的 world 或 characters 发生变化时（例如重新生成），同步更新本地状态
  useEffect(() => {
    setEditableWorld(world);
    setEditableCharacters(characters);
  }, [world, characters]);

  const handleWorldChange = (field: keyof WorldSetting, value: string) => {
    setEditableWorld(prev => ({ ...prev, [field]: value }));
  };

  const handleDeleteCharacter = (index: number) => {
    if (window.confirm("确定要删除这个角色吗？")) {
      setEditableCharacters(prev => prev.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-12">
      <div className="flex justify-between items-center border-b border-gray-800 pb-4">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Globe className="text-indigo-400" />
          世界观与人物设定
        </h2>
        <button
          onClick={() => onConfirm(editableWorld, editableCharacters)}
          disabled={isLoading}
          className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50"
        >
          {isLoading ? '生成大纲中...' : '确认并生成大纲'}
          {!isLoading && <ArrowRight size={18} />}
        </button>
      </div>

      {/* 世界观卡片 */}
      <div className="bg-gray-850 rounded-xl border border-gray-700 p-6 shadow-lg">
        <div className="mb-4">
           <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">世界主题</label>
           <div className="flex items-center gap-2">
             <Zap size={20} className="text-indigo-400 shrink-0" />
             <input 
                type="text"
                value={editableWorld.theme}
                onChange={(e) => handleWorldChange('theme', e.target.value)}
                className="bg-transparent border-b border-gray-600 focus:border-indigo-500 outline-none text-xl font-bold text-indigo-300 w-full transition-colors pb-1"
                placeholder="输入故事主题..."
             />
             <CopyBtn text={`主题：${editableWorld.theme}\n体系：${editableWorld.powerSystem}\n规则：${editableWorld.rules}`} />
           </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">力量体系</span>
            <div className="flex items-start gap-2">
              <textarea 
                value={editableWorld.powerSystem}
                onChange={(e) => handleWorldChange('powerSystem', e.target.value)}
                className="w-full bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-gray-300 focus:border-indigo-500 outline-none resize-none h-32 text-sm leading-relaxed transition-all focus:ring-1 focus:ring-indigo-500/50"
                placeholder="描述这个世界的力量等级和修炼方式..."
              />
              <CopyBtn text={editableWorld.powerSystem} />
            </div>
          </div>
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">核心规则</span>
            <div className="flex items-start gap-2">
              <textarea 
                value={editableWorld.rules}
                onChange={(e) => handleWorldChange('rules', e.target.value)}
                className="w-full bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-gray-300 focus:border-indigo-500 outline-none resize-none h-32 text-sm leading-relaxed transition-all focus:ring-1 focus:ring-indigo-500/50"
                placeholder="描述这个世界的运行规则和禁忌..."
              />
              <CopyBtn text={editableWorld.rules} />
            </div>
          </div>
        </div>
      </div>

      {/* 角色列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {editableCharacters.map((char, idx) => (
          <div 
            key={idx} 
            className={`relative rounded-xl border p-5 shadow-md flex flex-col gap-3 group/card
              ${char.role === 'Protagonist' 
                ? 'bg-indigo-900/20 border-indigo-500/50' 
                : char.role === 'Antagonist'
                  ? 'bg-red-900/10 border-red-500/30'
                  : 'bg-gray-850 border-gray-700'
              }`}
          >
            {/* 删除按钮：主角不能删除 */}
            {char.role !== 'Protagonist' && (
              <button 
                onClick={() => handleDeleteCharacter(idx)}
                className="absolute top-3 right-3 p-1.5 rounded-full text-gray-500 hover:bg-red-900/50 hover:text-red-400 opacity-0 group-hover/card:opacity-100 transition-all z-10"
                title="删除角色"
              >
                <Trash2 size={16} />
              </button>
            )}

            <div className="flex justify-between items-start">
              <div className="flex items-center gap-1">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  {char.name}
                  {char.role === 'Protagonist' && <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded text-white">主角</span>}
                  {char.role === 'Antagonist' && <span className="text-xs bg-red-600 px-2 py-0.5 rounded text-white">反派</span>}
                </h4>
                <CopyBtn text={`角色：${char.name}\n定位：${char.role}\n性格：${char.personality}\n目标：${char.goal}\n背景：${char.background}\n${char.cheat ? `金手指：${char.cheat}` : ''}`} className="ml-1" />
                <p className="text-sm text-gray-400 italic ml-2">{char.role === 'Support' ? '重要配角' : char.role === 'Mob' ? '路人/炮灰' : ''}</p>
              </div>
              {char.role === 'Protagonist' ? <User className="text-indigo-400" /> : <User className="text-gray-600" />}
            </div>

            <div className="space-y-2 text-sm text-gray-300 flex-grow">
              <div className="flex items-start justify-between group">
                <div>
                  <span className="text-gray-500 font-semibold mr-2">性格:</span>
                  {char.personality}
                </div>
                <CopyBtn text={char.personality} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-start justify-between group">
                 <div>
                  <span className="text-gray-500 font-semibold mr-2">目标:</span>
                  {char.goal}
                 </div>
                 <CopyBtn text={char.goal} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="group relative">
                <span className="text-gray-500 font-semibold mr-2">背景:</span>
                <span className="line-clamp-3">{char.background}</span>
                <div className="absolute top-0 right-0">
                  <CopyBtn text={char.background} className="opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900/80 backdrop-blur" />
                </div>
              </div>
            </div>

            {char.cheat && (
              <div className="mt-auto pt-3 border-t border-indigo-500/30 group relative">
                <div className="text-xs text-yellow-400 font-bold flex items-center gap-1 mb-1">
                  <Shield size={12} />
                  金手指 / 能力
                </div>
                <p className="text-sm text-yellow-100/80 pr-6">{char.cheat}</p>
                <div className="absolute top-2 right-0">
                  <CopyBtn text={char.cheat} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StepCharacters;