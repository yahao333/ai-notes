import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy, Check, FileText, Type } from 'lucide-react';

interface Props {
  title: string;
  content: string;
  isStreaming: boolean;
}

const ChapterReader: React.FC<Props> = ({ title, content, isStreaming }) => {
  const [copied, setCopied] = useState(false);
  const [titleCopied, setTitleCopied] = useState(false);

  const handleCopy = () => {
    if (!content) return;
    // 将连续的换行符(包括多个空行)替换为单个换行符，压缩排版
    const compressedContent = content.replace(/\n+/g, '\n');
    navigator.clipboard.writeText(`${title}\n\n${compressedContent}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyTitle = () => {
    navigator.clipboard.writeText(title);
    setTitleCopied(true);
    setTimeout(() => setTitleCopied(false), 2000);
  };

  const buttonBaseClass = "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border";
  const inactiveClass = "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 hover:border-gray-600";
  const activeClass = "bg-green-900/30 border-green-500/50 text-green-400";

  return (
    <div className="w-full bg-gray-900 min-h-[600px] p-8 rounded-xl shadow-2xl border border-gray-800 relative group">
      
      {/* 标题区域 */}
      <div className="mb-8 pb-6 border-b border-gray-800 text-center">
        <h2 className="text-3xl font-serif font-bold text-gray-100 mb-6 leading-tight">
          {title}
        </h2>
        
        {/* 按钮工具栏：水平排列在标题下方 */}
        <div className="flex items-center justify-center gap-4">
            <button 
                onClick={handleCopyTitle}
                className={`${buttonBaseClass} ${titleCopied ? activeClass : inactiveClass}`}
                title="仅复制章节标题"
            >
                {titleCopied ? <Check size={16} /> : <Type size={16} />}
                {titleCopied ? '标题已复制' : '复制标题'}
            </button>

            <button
                onClick={handleCopy}
                disabled={!content}
                className={`${buttonBaseClass} ${copied ? activeClass : inactiveClass} ${!content ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                title="复制标题和正文"
            >
                {copied ? <Check size={16} /> : <FileText size={16} />}
                {copied ? '全文已复制' : '复制正文'}
            </button>
        </div>
      </div>
      
      {/* 正文区域 */}
      <div className="prose prose-invert prose-lg max-w-none font-serif leading-loose text-gray-300">
        {content ? (
           content.split('\n').map((para, i) => (
             <p key={i} className="mb-4 min-h-[1em]">{para}</p>
           ))
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 space-y-4">
            <p>等待生成正文...</p>
          </div>
        )}
        {isStreaming && (
          <span className="inline-block w-2 h-5 ml-1 bg-indigo-500 animate-pulse align-middle"></span>
        )}
      </div>
    </div>
  );
};

export default ChapterReader;