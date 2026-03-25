
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Character, WorldSetting, PlotPoint, ChapterOutline, ChapterContent, ModelProvider } from "../types";

// 延迟初始化 Gemini 客户端，确保只在需要时才创建
// 使用 import.meta.env.VITE_GEMINI_API_KEY 获取环境变量
let ai: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!ai) {
    const apiKey = (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_GEMINI_API_KEY) || process.env.GEMINI_API_KEY || '';
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

// Google 模型默认值
const DEFAULT_GOOGLE_MODEL = "gemini-3-pro-preview";
export const GOOGLE_FLASH_MODEL = "gemini-3-flash-preview"; // 导出 Flash 模型常量

// 阿里云配置
const ALIYUN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const ALIYUN_MODEL_NAME = "qwen-max"; // 使用通义千问 Max

// --- Retry Helper ---

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 定义固定的重试延迟时间策略 (单位: 毫秒)
const RETRY_DELAYS = [2000, 10000, 30000, 60000];

/**
 * 带有固定时间间隔的重试包装函数
 * 策略：2秒 -> 10秒 -> 30秒 -> 60秒
 * 处理 429 (Too Many Requests) 和 503 (Service Unavailable) 错误
 */
async function retryOperation<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: any;

    // 循环次数 = 1次首次尝试 + 重试次数(RETRY_DELAYS.length)
    for (let i = 0; i <= RETRY_DELAYS.length; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            
            // 识别速率限制或服务器过载错误
            const isRateLimit = 
                error?.status === 429 || 
                error?.code === 429 || 
                error?.message?.includes('429') || 
                error?.message?.includes('RESOURCE_EXHAUSTED') ||
                error?.message?.includes('quota');
            
            const isServerError = error?.status === 503;

            // 如果是可重试的错误，且还有重试机会
            if ((isRateLimit || isServerError) && i < RETRY_DELAYS.length) {
                const delay = RETRY_DELAYS[i];
                console.warn(`[AI Service] API 请求受限或繁忙 (尝试 ${i + 1}/${RETRY_DELAYS.length})，将在 ${delay/1000}秒后重试...`, error.message);
                await sleep(delay);
                continue;
            }
            
            // 其他错误或重试次数用尽，直接抛出
            throw error;
        }
    }
    throw lastError;
}

// --- Helper Functions for Aliyun ---

async function callAliyunJSON(messages: any[], apiKey: string, schema?: any): Promise<any> {
  const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
  const userPrompt = messages.find(m => m.role === 'user')?.content || '';

  // 将 Schema 注入到 Prompt 中，因为兼容模式可能不完全支持 strict JSON mode
  let finalPrompt = userPrompt;
  if (schema) {
    finalPrompt += `\n\n请务必严格按照以下 JSON 格式输出，不要包含 Markdown 代码块标记（如 \`\`\`json）：\n${JSON.stringify(schema, null, 2)}`;
  }

  const response = await fetch(ALIYUN_BASE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ALIYUN_MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: finalPrompt }
      ],
      temperature: 0.85,
      response_format: { type: "json_object" } // 启用 JSON 模式
    })
  });

  if (!response.ok) {
    const err = await response.text();
    // Fetch 错误不包含 status 属性供上层判断，手动构造一个带 status 的错误对象以便 retryOperation 识别
    const error: any = new Error(`Aliyun API Error: ${err}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  // 清理可能存在的 markdown 标记
  const cleanContent = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  return JSON.parse(cleanContent);
}

async function* callAliyunStream(messages: any[], apiKey: string): AsyncGenerator<string, void, unknown> {
  const response = await fetch(ALIYUN_BASE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ALIYUN_MODEL_NAME,
      messages: messages,
      stream: true,
      temperature: 0.85
    })
  });

  if (!response.ok) {
      const error: any = new Error("Aliyun Stream Error");
      error.status = response.status;
      throw error;
  }
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (trimmed.startsWith("data: ")) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const content = json.choices[0]?.delta?.content || "";
          if (content) yield content;
        } catch (e) {
          console.error("Parse error", e);
        }
      }
    }
  }
}

async function callAliyunText(messages: any[], apiKey: string): Promise<string> {
    const response = await fetch(ALIYUN_BASE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ALIYUN_MODEL_NAME,
      messages: messages,
      temperature: 0.85
    })
  });

  if (!response.ok) {
      const error: any = new Error("Aliyun API Error");
      error.status = response.status;
      throw error;
  }
  const data = await response.json();
  return data.choices[0].message.content;
}


// --- Exported Functions (Refactored) ---

/**
 * 第一步：生成角色和世界观
 */
export const generateCharactersAndWorld = async (
    prompt: string, 
    provider: ModelProvider = 'google', 
    aliyunApiKey?: string,
    googleModelName: string = DEFAULT_GOOGLE_MODEL
): Promise<{ characters: Character[], world: WorldSetting }> => {
  console.log(`正在请求 ${provider} (${provider === 'google' ? googleModelName : ALIYUN_MODEL_NAME}) 生成后宫爽文人设和世界观...`);
  
  const systemInstruction = `
    你是一位专门服务于中国年轻男性的网文大神，最擅长写"重生"、"都市/玄幻后宫"、"无敌流"爽文。
    你的文风要骚气、热血、直白，深谙读者的爽点。
    
    你的任务是根据用户的脑洞，设计一个极具吸引力的世界观和人物列表。
    
    【核心要求】
    1. **主角设定**：必须是男性，性格杀伐果断，不圣母，智商在线，拥有绝对逆天的金手指（系统、神器、前世记忆等）。
    2. **后宫团设定**：必须至少设计 3-4 位不同类型的**极品美女**作为主要配角（如：高冷校花、傲娇大小姐、温柔青梅、妩媚女总裁、绝美师尊等）。
       - 每个人物都要有极其惊艳的外貌描写关键词（黑丝、长腿、御姐等）。
       - 每个人物都要有明显的"反差萌"或独特的性格标签。
       - 初始对主角态度可以是鄙视或路人，方便后续攻略。
    3. **反派设定**：反派要嚣张跋扈，富二代或宗门圣子，专门用来给主角打脸，也就是"经验包"。
    4. **世界观**：要有等级森严的制度，方便主角通过升级来打破规则，装逼打脸。
  `;

  const responseSchemaObj = {
      type: "object",
      properties: {
        world: {
          type: "object",
          properties: {
            theme: { type: "string", description: "故事主题" },
            powerSystem: { type: "string", description: "力量体系" },
            rules: { type: "string", description: "核心规则" },
          },
          required: ["theme", "powerSystem", "rules"],
        },
        characters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string", enum: ["Protagonist", "Antagonist", "Support", "Mob"] },
              personality: { type: "string" },
              background: { type: "string" },
              goal: { type: "string" },
              cheat: { type: "string" },
            },
            required: ["name", "role", "personality", "background", "goal"],
          },
        },
      },
      required: ["world", "characters"],
    };

  const googleSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      world: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING },
          powerSystem: { type: Type.STRING },
          rules: { type: Type.STRING },
        },
        required: ["theme", "powerSystem", "rules"],
      },
      characters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            role: { type: Type.STRING, enum: ["Protagonist", "Antagonist", "Support", "Mob"] },
            personality: { type: Type.STRING },
            background: { type: Type.STRING },
            goal: { type: Type.STRING },
            cheat: { type: Type.STRING },
          },
          required: ["name", "role", "personality", "background", "goal"],
        },
      },
    },
    required: ["world", "characters"],
  };

  return retryOperation(async () => {
    try {
        if (provider === 'aliyun') {
            if (!aliyunApiKey) throw new Error("请在设置中配置阿里云 API Key");
            return await callAliyunJSON([
                { role: "system", content: systemInstruction },
                { role: "user", content: prompt }
            ], aliyunApiKey, responseSchemaObj);
        } else {
            const response = await getAiClient().models.generateContent({
                model: googleModelName,
                contents: prompt,
                config: {
                    systemInstruction: systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: googleSchema,
                    temperature: 0.9,
                },
            });
            const text = response.text;
            if (!text) throw new Error("API 返回为空");
            return JSON.parse(text);
        }
    } catch (error) {
        console.error("生成角色失败:", error);
        throw error;
    }
  });
};

/**
 * 第二步：生成主线大纲
 */
export const generateMainPlot = async (
    world: WorldSetting, 
    characters: Character[],
    provider: ModelProvider = 'google', 
    aliyunApiKey?: string,
    googleModelName: string = DEFAULT_GOOGLE_MODEL
): Promise<PlotPoint[]> => {
  console.log("正在请求 AI 生成爽文主线大纲...");

  const charContext = characters.map(c => {
    let desc = `${c.name} (${c.role === 'Protagonist' ? '男主' : c.role === 'Antagonist' ? '反派' : '重要配角/女主'}): ${c.background}. 性格: ${c.personality}`;
    if (c.role === 'Support') desc += " [后宫预备/重要盟友]";
    return desc;
  }).join("\n");

  const worldContext = `世界: ${world.theme}. 力量体系: ${world.powerSystem}. 规则: ${world.rules}`;

  const prompt = `
    基于以下设定，生成一个让年轻男性读者热血沸腾的爽文主线大纲。
    
    【世界设定】
    ${worldContext}
    
    【人物设定】
    ${charContext}
    
    要求：
    1. **节奏紧凑**：分为 4-6 个关键大剧情节点。
    2. **核心爽点**：每个阶段必须包含"扮猪吃虎"、"人前显圣"或"强势打脸"的情节。
    3. **感情线**：必须穿插主角收服各路美女（女主）的过程，或者英雄救美、暧昧互动的情节。
    4. **目标明确**：从微末崛起，最终登顶世界巅峰，拥有无尽财富和权力。
  `;

  const googleSchema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        phase: { type: Type.STRING },
        summary: { type: Type.STRING },
      },
      required: ["phase", "summary"],
    },
  };
  
  const aliyunSchema = {
      type: "object", 
      properties: {
          plot_points: {
              type: "array",
              items: {
                  type: "object",
                  properties: {
                      phase: { type: "string" },
                      summary: { type: "string" }
                  },
                  required: ["phase", "summary"]
              }
          }
      },
      required: ["plot_points"]
  };

  return retryOperation(async () => {
      try {
        if (provider === 'aliyun') {
            if (!aliyunApiKey) throw new Error("请在设置中配置阿里云 API Key");
            const res = await callAliyunJSON([
                { role: "system", content: "你是一个网文大纲助手。" },
                { role: "user", content: prompt }
            ], aliyunApiKey, aliyunSchema);
            return res.plot_points || res; 
        } else {
            const response = await getAiClient().models.generateContent({
                model: googleModelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: googleSchema,
                },
            });
            const text = response.text;
            if (!text) throw new Error("API 返回为空");
            return JSON.parse(text);
        }
    } catch (error) {
        console.error("生成大纲失败:", error);
        throw error;
    }
  });
};

/**
 * 第三步：生成具体章节细纲
 */
export const generateChapterOutlines = async (
  world: WorldSetting, 
  characters: Character[], 
  plot: PlotPoint[],
  count: number = 5,
  provider: ModelProvider = 'google', 
  aliyunApiKey?: string,
  googleModelName: string = DEFAULT_GOOGLE_MODEL
): Promise<ChapterOutline[]> => {
  console.log(`正在生成前 ${count} 章的细纲...`);

  const plotContext = plot.map(p => `[${p.phase}] ${p.summary}`).join("\n");
  const charContext = characters.map(c => `${c.name} (${c.role})`).join(", ");
  
  const prompt = `
    请根据主线大纲，规划前 ${count} 章的详细细纲。
    
    【主线大纲】
    ${plotContext}

    【人物】
    ${charContext}
    
    要求：
    1. **黄金三章法则**：
       - 第一章：必须有强烈的冲突（被退婚、被羞辱、重生节点），并结尾觉醒金手指。
       - 第二章：小试牛刀，利用金手指获得初步优势，震惊路人。
       - 第三章：第一个小高潮，打脸反派（或反派的小弟），收获第一位美女的好感。
    2. **爽点密集**：每一章都要有一个明确的"爽点"（Cool Point）或"期待感"（Hook）。
    3. **细致**：summary 字段要包含具体发生的事件，不要只写空话。
  `;

  const googleSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      chapters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            chapterNumber: { type: Type.INTEGER },
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            narrativePulse: { type: Type.STRING },
            coolPoint: { type: Type.STRING },
            rules: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["chapterNumber", "title", "summary", "narrativePulse", "coolPoint", "rules"],
        },
      }
    },
    required: ["chapters"],
  };

  const aliyunSchema = {
      type: "object",
      properties: {
          chapters: {
              type: "array",
              items: {
                  type: "object",
                  properties: {
                      chapterNumber: { type: "integer" },
                      title: { type: "string" },
                      summary: { type: "string" },
                      narrativePulse: { type: "string" },
                      coolPoint: { type: "string" },
                      rules: { type: "array", items: { type: "string" } }
                  },
                  required: ["chapterNumber", "title", "summary", "narrativePulse", "coolPoint", "rules"]
              }
          }
      },
      required: ["chapters"]
  };

  return retryOperation(async () => {
    try {
        if (provider === 'aliyun') {
            if (!aliyunApiKey) throw new Error("请在设置中配置阿里云 API Key");
            const res = await callAliyunJSON([
                { role: "system", content: "你是一个网文细纲助手。" },
                { role: "user", content: prompt }
            ], aliyunApiKey, aliyunSchema);
            return res.chapters;
        } else {
            const response = await getAiClient().models.generateContent({
                model: googleModelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: googleSchema,
                },
            });
            const text = response.text;
            if (!text) throw new Error("API 返回为空");
            return JSON.parse(text).chapters;
        }
    } catch (error) {
        console.error("生成细纲失败:", error);
        throw error;
    }
  });
};

/**
 * 3.5步：续写后续章节细纲
 */
export const generateNextChapterOutlines = async (
  world: WorldSetting,
  characters: Character[],
  plot: PlotPoint[],
  lastChapter: ChapterOutline,
  count: number = 5,
  storySummary?: string, 
  plotDirection?: string,
  provider: ModelProvider = 'google', 
  aliyunApiKey?: string,
  googleModelName: string = DEFAULT_GOOGLE_MODEL
): Promise<ChapterOutline[]> => {
  const nextStart = lastChapter.chapterNumber + 1;
  console.log(`正在续写第 ${nextStart} - ${nextStart + count - 1} 章的细纲...`, plotDirection ? `[剧情指令: ${plotDirection}]` : '');

  const plotContext = plot.map(p => `[${p.phase}] ${p.summary}`).join("\n");
  
  const prompt = `
    你正在创作一部长篇爽文。目前已完成到第 ${lastChapter.chapterNumber} 章。
    
    ${storySummary ? `
    【前情提要 / 长期记忆】
    (这是之前所有剧情的浓缩摘要，请严格基于此规划后续剧情，保持连贯性)
    ${storySummary}
    ` : ''}

    【当前进度】
    上一章标题：${lastChapter.title}
    上一章剧情：${lastChapter.summary}
    
    【主线大纲】
    ${plotContext}

    ${plotDirection ? `
    【用户指定剧情走向（最高优先级）】
    用户对接下来的剧情有明确要求，请务必将以下内容融入到接下来的 ${count} 章细纲中：
    >>> ${plotDirection}
    ` : ''}
    
    请继续规划接下来的 ${count} 章（第 ${nextStart} 章 到 第 ${nextStart + count - 1} 章）的细纲。
    
    要求：
    1. **承上启下**：紧接上一章的剧情发展，不要断层。参考【前情提要】中的人际关系和伏笔。
    2. **升级节奏**：主角的能力要逐步体现，遇到的敌人要越来越强（或者背景越来越深）。
    3. **期待感**：每一章结尾都要留钩子。
    4. **后宫互动**：如果没有打斗，就安排暧昧情节。
    ${plotDirection ? '5. **指令执行**：必须响应用户的【指定剧情走向】要求，不要忽略。' : ''}
  `;

  // Schemas are same structure as initial generation
  const googleSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      chapters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            chapterNumber: { type: Type.INTEGER },
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            narrativePulse: { type: Type.STRING },
            coolPoint: { type: Type.STRING },
            rules: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["chapterNumber", "title", "summary", "narrativePulse", "coolPoint", "rules"],
        },
      }
    },
    required: ["chapters"],
  };

  const aliyunSchema = {
      type: "object",
      properties: {
          chapters: {
              type: "array",
              items: {
                  type: "object",
                  properties: {
                      chapterNumber: { type: "integer" },
                      title: { type: "string" },
                      summary: { type: "string" },
                      narrativePulse: { type: "string" },
                      coolPoint: { type: "string" },
                      rules: { type: "array", items: { type: "string" } }
                  },
                  required: ["chapterNumber", "title", "summary", "narrativePulse", "coolPoint", "rules"]
              }
          }
      },
      required: ["chapters"]
  };

  return retryOperation(async () => {
    try {
        if (provider === 'aliyun') {
            if (!aliyunApiKey) throw new Error("请在设置中配置阿里云 API Key");
            const res = await callAliyunJSON([
                { role: "system", content: "你是一个网文细纲续写助手。" },
                { role: "user", content: prompt }
            ], aliyunApiKey, aliyunSchema);
            return res.chapters;
        } else {
            const response = await getAiClient().models.generateContent({
                model: googleModelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: googleSchema,
                },
            });
            const text = response.text;
            if (!text) throw new Error("API 返回为空");
            return JSON.parse(text).chapters;
        }
    } catch (error) {
        console.error("续写细纲失败:", error);
        throw error;
    }
  });
}

/**
 * 额外功能：生成5章剧情小结标题
 */
export const generateBatchSummary = async (
    chapters: ChapterOutline[],
    provider: ModelProvider = 'google', 
    aliyunApiKey?: string,
    googleModelName: string = DEFAULT_GOOGLE_MODEL
): Promise<string> => {
  console.log(`正在生成段落小结标题... (Model: ${provider === 'google' ? googleModelName : 'Aliyun'})`);
  
  const context = chapters.map(c => `第${c.chapterNumber}章：${c.title} - ${c.summary}`).join("\n");

  const prompt = `
    阅读以下 5 个章节的剧情梗概，提炼出一个极具吸引力的“卷标”或“段落小标题”。
    
    【剧情内容】
    ${context}
    
    【要求】
    1. **字数限制**：必须在 20 字以内。
    2. **风格**：网文爽文风格，霸气、悬疑或诱人。
    3. **输出**：直接返回标题字符串，不要加书名号或其他符号。
  `;

  const googleSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      summaryTitle: { type: Type.STRING }
    },
    required: ["summaryTitle"]
  };

  const aliyunSchema = {
      type: "object",
      properties: {
          summaryTitle: { type: "string" }
      },
      required: ["summaryTitle"]
  };

  return retryOperation(async () => {
    try {
        if (provider === 'aliyun') {
            if (!aliyunApiKey) throw new Error("请配置阿里云 API Key");
            const res = await callAliyunJSON([
                { role: "user", content: prompt }
            ], aliyunApiKey, aliyunSchema);
            return res.summaryTitle;
        } else {
            const response = await getAiClient().models.generateContent({
                model: googleModelName, 
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: googleSchema,
                },
            });
            const text = response.text;
            return JSON.parse(text).summaryTitle;
        }
    } catch (error) {
        console.error("生成小结失败:", error);
        return "新的篇章";
    }
  });
}

/**
 * 核心功能：压缩剧情历史
 */
export const compressStoryHistory = async (
    chapters: ChapterContent[],
    characters: Character[],
    endChapterIndex: number,
    provider: ModelProvider = 'google', 
    aliyunApiKey?: string,
    googleModelName: string = DEFAULT_GOOGLE_MODEL
): Promise<string> => {
    console.log(`正在压缩前 ${endChapterIndex + 1} 章的剧情...`);

    const protagonists = characters.filter(c => c.role === 'Protagonist' || c.role === 'Support');
    const protagonistNames = protagonists.map(c => `${c.name}(${c.role === 'Protagonist' ? '男主' : '女主'})`).join('、');

    let contextText = "";
    const targetChapters = chapters.slice(0, endChapterIndex + 1);
    
    contextText = targetChapters.map(c => {
        const content = c.content || c.outline.summary;
        return `### 第${c.outline.chapterNumber}章：${c.outline.title}\n${content.slice(0, 2000)}`;
    }).join("\n\n");

    const prompt = `
    你是一位网文编辑。请阅读以下小说前 ${endChapterIndex + 1} 章的内容，生成一份**详细的剧情回顾/记忆摘要**。
    这份摘要将作为 AI 继续创作后续章节的"长期记忆"。

    【重点关注人物】
    ${protagonistNames}

    【输入内容】
    ${contextText}

    【输出要求】
    1. **人称**：使用第三人称。
    2. **核心剧情**：概括主角的等级变化、获得的关键宝物、击败的主要敌人。
    3. **情感进度（至关重要）**：
       - 必须逐一列出主角与**每一位**已登场女主（${protagonistNames}）的互动进展。
       - 她们目前对主角的好感度如何？发生了什么暧昧或冲突事件？
    4. **未完伏笔**：列出目前剧情中挖了坑但还没填的伏笔。
    5. **格式**：分点叙述，条理清晰，字数控制在 1000 字以内。
    `;

    return retryOperation(async () => {
        try {
            if (provider === 'aliyun') {
                if (!aliyunApiKey) throw new Error("请配置阿里云 API Key");
                // 压缩任务不需要 JSON，直接返回文本
                return await callAliyunText([
                    { role: "system", content: "你是一个专业的网文编辑助手。" },
                    { role: "user", content: prompt }
                ], aliyunApiKey);
            } else {
                const response = await getAiClient().models.generateContent({
                    model: googleModelName,
                    contents: prompt,
                });
                const text = response.text;
                if (!text) throw new Error("压缩摘要生成为空");
                return text;
            }
        } catch (error) {
            console.error("剧情压缩失败:", error);
            throw error;
        }
    });
};

/**
 * 第四步：流式生成章节正文
 */
export const streamChapterContent = async (
  chapter: ChapterOutline,
  world: WorldSetting,
  characters: Character[],
  prevContext: string | null,
  onChunk: (text: string) => void,
  additionalInstructions?: string,
  storySummary?: string,
  provider: ModelProvider = 'google', 
  aliyunApiKey?: string,
  googleModelName: string = DEFAULT_GOOGLE_MODEL
): Promise<void> => {
  console.log(`正在流式生成第 ${chapter.chapterNumber} 章正文... (${provider})`);

  const charContext = characters.map(c => {
    let t = `${c.name}: ${c.personality}, ${c.background}`;
    if (c.role === 'Support') t += " (重点描写对象：外貌、身材、气味)";
    return t;
  }).join("\n");

  const prompt = `
    你现在是全网最火的爽文作家。请根据以下大纲撰写第 ${chapter.chapterNumber} 章的正文。
    
    【章节信息】
    标题：${chapter.title}
    梗概：${chapter.summary}
    爽点：${chapter.coolPoint}
    核心规则：${chapter.rules.join(", ")}
    
    ${storySummary ? `
    【前情提要 / 长期记忆】
    (请参考此内容保持人设和剧情连贯，特别是男女主关系)
    ${storySummary}
    ` : ''}

    【上下文】
    上一章内容：${prevContext || "这是第一章，直接开始"}
    
    【世界与人物】
    世界风格：${world.theme}
    人物设定：
    ${charContext}
    
    【写作要求】
    1. **文风**：小白文风格，短句为主，节奏极快。不要文青，不要谜语人。
    2. **感官描写**：
       - 对女性角色：重点描写身材（长腿、细腰、曲线）、五官、声音（娇喘、冷哼）和气味（体香）。
       - 对打脸情节：描写反派的嚣张嘴脸（前）和震惊、恐惧的表情（后），形成强烈对比。
       - 对路人反应：要有大量的"倒吸一口凉气"、"目瞪口呆"等侧面描写来衬托主角的牛逼。
    3. **对话**：要口语化，装逼台词要够硬，撩妹台词要够骚。
    4. **字数**：2000字左右。
    5. **排版**：段落之间空一行，方便手机阅读。
    ${additionalInstructions ? `
    【特别修订指令】
    用户对本次写作有以下特别要求，请务必在文中体现：
    ${additionalInstructions}
    ` : ''}
  `;

  // 对于流式传输，通常 429 发生在请求建立阶段。
  // 我们将流的建立过程包裹在重试逻辑中。
  // 注意：如果流已经开始传输数据后中断，目前不会重试，以防止重复内容。
  
  await retryOperation(async () => {
    try {
        if (provider === 'aliyun') {
            if (!aliyunApiKey) throw new Error("请配置阿里云 API Key");
            const generator = callAliyunStream([
                { role: "user", content: prompt }
            ], aliyunApiKey);
            for await (const chunk of generator) {
                onChunk(chunk);
            }
        } else {
            const responseStream = await getAiClient().models.generateContentStream({
                model: googleModelName,
                contents: prompt,
            });

            for await (const chunk of responseStream) {
                const text = chunk.text;
                if (text) {
                    onChunk(text);
                }
            }
        }
    } catch (error) {
        console.error("正文生成流中断:", error);
        throw error;
    }
  });
};

/**
 * 第四步加强版：非流式生成完整章节 (用于批量生成)
 */
export const generateFullChapterContent = async (
  chapter: ChapterOutline,
  world: WorldSetting,
  characters: Character[],
  prevContext: string | null,
  additionalInstructions?: string,
  storySummary?: string,
  provider: ModelProvider = 'google', 
  aliyunApiKey?: string,
  googleModelName: string = DEFAULT_GOOGLE_MODEL
): Promise<string> => {
  console.log(`正在批量生成第 ${chapter.chapterNumber} 章正文(非流式)...`);

  const charContext = characters.map(c => {
    let t = `${c.name}: ${c.personality}, ${c.background}`;
    if (c.role === 'Support') t += " (重点描写对象：外貌、身材、气味)";
    return t;
  }).join("\n");

  const prompt = `
    你现在是全网最火的爽文作家。请根据以下大纲撰写第 ${chapter.chapterNumber} 章的正文。
    
    【章节信息】
    标题：${chapter.title}
    梗概：${chapter.summary}
    爽点：${chapter.coolPoint}
    核心规则：${chapter.rules.join(", ")}
    
    ${storySummary ? `
    【前情提要 / 长期记忆】
    (请参考此内容保持人设和剧情连贯，特别是男女主关系)
    ${storySummary}
    ` : ''}

    【上下文】
    上一章内容：${prevContext || "这是第一章，直接开始"}
    
    【世界与人物】
    世界风格：${world.theme}
    人物设定：
    ${charContext}
    
    【写作要求】
    1. **文风**：小白文风格，短句为主，节奏极快。不要文青，不要谜语人。
    2. **感官描写**：
       - 对女性角色：重点描写身材（长腿、细腰、曲线）、五官、声音（娇喘、冷哼）和气味（体香）。
       - 对打脸情节：描写反派的嚣张嘴脸（前）和震惊、恐惧的表情（后），形成强烈对比。
       - 对路人反应：要有大量的"倒吸一口凉气"、"目瞪口呆"等侧面描写来衬托主角的牛逼。
    3. **对话**：要口语化，装逼台词要够硬，撩妹台词要够骚。
    4. **字数**：2000字左右。
    5. **排版**：段落之间空一行，方便手机阅读。
    ${additionalInstructions ? `
    【特别修订指令】
    用户对本次写作有以下特别要求，请务必在文中体现：
    ${additionalInstructions}
    ` : ''}
  `;

  return retryOperation(async () => {
    try {
        if (provider === 'aliyun') {
            if (!aliyunApiKey) throw new Error("请配置阿里云 API Key");
            return await callAliyunText([
                { role: "user", content: prompt }
            ], aliyunApiKey);
        } else {
            const response = await getAiClient().models.generateContent({
                model: googleModelName,
                contents: prompt,
            });
            
            const text = response.text;
            if (!text) throw new Error("正文生成返回为空");
            return text;
        }
    } catch (error) {
        console.error("正文批量生成失败:", error);
        throw error;
    }
  });
};

/**
 * 额外功能：生成书名
 */
export const generateBookTitles = async (
  promptText: string,
  world?: WorldSetting | null,
  characters?: Character[],
  provider: ModelProvider = 'google', 
  aliyunApiKey?: string,
  googleModelName: string = DEFAULT_GOOGLE_MODEL
): Promise<string[]> => {
  console.log("正在生成书名...");

  let context = `核心脑洞：${promptText}\n`;
  if (world) {
    context += `世界观主题：${world.theme}\n`;
    context += `力量体系：${world.powerSystem}\n`;
  }
  if (characters && characters.length > 0) {
    const protag = characters.find(c => c.role === 'Protagonist');
    if (protag) {
      context += `主角金手指：${protag.cheat}\n`;
      context += `主角性格：${protag.personality}\n`;
    }
  }

  const prompt = `
    你是一个精通中国网文市场的资深编辑。请根据以下小说设定，想出 10 个极具吸引力、符合"飞卢风"或"起点爽文风"的书名。
    
    【小说设定】
    ${context}
    
    【起名要求】
    1. **吸睛**：要包含"重生"、"开局"、"无敌"、"多子多福"、"校花"、"女帝"等热门关键词。
    2. **直白**：书名要能直接体现金手指或核心爽点。
    3. **格式**：不要加书名号，直接返回书名列表。
    4. **风格多样**：有的可以侧重系统，有的侧重后宫，有的侧重无敌。
    
    例如：
    - 重生都市：开局截胡校花机缘
    - 高武：因为太怕痛所以全点防御力了
    - 让你代管宗门，全成大帝了？
  `;

  const googleSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      titles: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["titles"],
  };

  const aliyunSchema = {
      type: "object",
      properties: {
          titles: { type: "array", items: { type: "string" } },
      },
      required: ["titles"],
  };

  return retryOperation(async () => {
    try {
        if (provider === 'aliyun') {
            if (!aliyunApiKey) throw new Error("请配置阿里云 API Key");
            const res = await callAliyunJSON([
                { role: "user", content: prompt }
            ], aliyunApiKey, aliyunSchema);
            return res.titles;
        } else {
            const response = await getAiClient().models.generateContent({
                model: googleModelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: googleSchema,
                    temperature: 0.95,
                },
            });

            const text = response.text;
            if (!text) throw new Error("书名生成返回为空");
            const json = JSON.parse(text);
            return json.titles;
        }
    } catch (error) {
        console.error("书名生成失败:", error);
        return ["重生之逆天改命", "都市之最强仙尊", "开局一把刀", "我的系统太强了"];
    }
  });
};
