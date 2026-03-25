
// 角色定义
export interface Character {
  name: string;
  role: 'Protagonist' | 'Antagonist' | 'Support' | 'Mob';
  personality: string; // 性格特征
  background: string; // 背景故事
  goal: string; // 目标
  cheat?: string; // 金手指/特殊能力 (仅主角有)
}

// 世界观设定
export interface WorldSetting {
  theme: string; // 如：赛博修仙、末世重生
  powerSystem: string; // 力量体系
  rules: string; // 世界核心规则
}

// 故事大纲节点
export interface PlotPoint {
  phase: string; // 阶段：开篇、发展、高潮、结尾
  summary: string; // 剧情概括
}

// 章节细纲
export interface ChapterOutline {
  chapterNumber: number;
  title: string;
  summary: string; // 故事梗概
  narrativePulse: string; // 叙事脉络
  coolPoint: string; // 本章爽点 (Cool Point)
  rules: string[]; // 必须遵守的规则/限制
  groupSummary?: string; // 新增：每5章的卷/段落小标题
}

// 章节正文
export interface ChapterContent {
  outline: ChapterOutline;
  content: string; // 生成的正文内容
  isGenerated: boolean;
}

// 应用当前的生成步骤
export enum GenerationStep {
  SETUP = 'SETUP',
  CHARACTERS = 'CHARACTERS',
  PLOT = 'PLOT',
  CHAPTER_PLAN = 'CHAPTER_PLAN',
  WRITING = 'WRITING'
}

// 模型提供商
export type ModelProvider = 'google' | 'aliyun';

// 导出的项目数据结构
export interface ProjectData {
  version: number;
  step: GenerationStep;
  bookTitle?: string; // 新增：书名
  prompt: string; // 保存初始脑洞
  world: WorldSetting | null;
  characters: Character[];
  plot: PlotPoint[];
  chapters: ChapterContent[];
  batchSize?: number; // 新增：批量生成数量配置
  storySummary?: string; // 新增：剧情回顾/压缩摘要，用于长期记忆
  modelProvider?: ModelProvider; // 新增：模型提供商
  googleModelName?: string; // 新增：Google 模型名称
  aliyunApiKey?: string; // 新增：阿里云 API Key
}
