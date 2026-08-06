export type SupportConfiguration = {
  step_size: "small" | "medium" | "large";
  structure_level: "minimal" | "progressive" | "full";
  pattern_guidance: "off" | "optional" | "active";
  explanation_mode: "concrete" | "formal" | "concrete_then_formal";
  presentation_density: "low" | "medium" | "high";
  scope_support: "off" | "on_request" | "active";
};

export type TaskState = {
  objective: string;
  requirements: string[];
  current_step: string | null;
  completed_steps: string[];
  deferred_ideas: string[];
};

export type SurveyAnswers = {
  start_pattern: "independent" | "hard_to_start" | "needs_structure" | "detail_trap" | "free_explore";
  stuck_pattern: "adaptive" | "distracted" | "persistent_stuck" | "detail_displacement" | "environment_overload";
  environment_preference: "quiet" | "ambient" | "flexible";
};

export type PreferredSupport =
  | "task_breaker"
  | "pattern_hinter"
  | "scope_guardian"
  | "focus_mode"
  | "concept_concretizer"
  | "structure_template";

export const defaultAnswers: SurveyAnswers = {
  start_pattern: "independent",
  stuck_pattern: "adaptive",
  environment_preference: "flexible",
};

export const defaultConfiguration: SupportConfiguration = {
  step_size: "medium",
  structure_level: "progressive",
  pattern_guidance: "optional",
  explanation_mode: "concrete_then_formal",
  presentation_density: "medium",
  scope_support: "on_request",
};

export const surveyQuestions = [
  {
    key: "start_pattern" as const,
    title: "开始一份陌生材料时，你希望 AI 怎么呈现？",
    options: [
      { value: "hard_to_start", label: "先给我一个很小、可以立刻执行的步骤" },
      { value: "needs_structure", label: "先展示目录、路线和整体结构" },
      { value: "detail_trap", label: "突出主线，把次要细节放到稍后" },
      { value: "free_explore", label: "提供几个入口，让我自由探索" },
      { value: "independent", label: "使用中性默认方式即可" },
    ],
  },
  {
    key: "stuck_pattern" as const,
    title: "内容难以理解时，你希望 AI 优先做什么？",
    options: [
      { value: "distracted", label: "缩短内容，一次只给一个行动" },
      { value: "persistent_stuck", label: "指出可能缺少的知识或隐藏关系" },
      { value: "detail_displacement", label: "提醒当前目标和真正需要解决的问题" },
      { value: "environment_overload", label: "减少同时出现的信息和选项" },
      { value: "adaptive", label: "提供另一种解释或具体示例" },
    ],
  },
  {
    key: "environment_preference" as const,
    title: "你希望页面和回答保持怎样的信息密度？",
    options: [
      { value: "quiet", label: "尽量低密度，减少视觉和解释负担" },
      { value: "ambient", label: "保持适中的结构与细节" },
      { value: "flexible", label: "使用中性默认呈现" },
    ],
  },
];

export const supportChoices: { value: PreferredSupport; label: string; detail: string }[] = [
  { value: "task_breaker", label: "阅读路线", detail: "拆成小目标并指出第一步" },
  { value: "concept_concretizer", label: "概念具象化", detail: "使用例子、类比或可观察过程" },
  { value: "structure_template", label: "结构模板", detail: "先展示目录、骨架和概念关系" },
  { value: "pattern_hinter", label: "知识连接", detail: "指出比较、规律和知识关系" },
  { value: "focus_mode", label: "专注模式", detail: "减少同时呈现的信息和选项" },
  { value: "scope_guardian", label: "主线提醒", detail: "只依据已提供要求区分核心与可选内容" },
];

export const configurationOptions = {
  step_size: {
    label: "单步大小",
    description: "一次展示多少学习进展",
    values: [["small", "小"], ["medium", "中"], ["large", "大"]],
  },
  structure_level: {
    label: "结构可见度",
    description: "计划、路线和中间目标显示多少",
    values: [["minimal", "最少"], ["progressive", "渐进展开"], ["full", "完整结构"]],
  },
  pattern_guidance: {
    label: "模式提示",
    description: "是否指出比较、规律和替代解释",
    values: [["off", "关闭"], ["optional", "可选"], ["active", "主动"]],
  },
  explanation_mode: {
    label: "解释方式",
    description: "具体示例与正式定义的平衡",
    values: [["concrete", "具体优先"], ["formal", "正式定义"], ["concrete_then_formal", "先具体后正式"]],
  },
  presentation_density: {
    label: "呈现密度",
    description: "文字长度和同时显示的信息量",
    values: [["low", "低"], ["medium", "中"], ["high", "高"]],
  },
  scope_support: {
    label: "范围支持",
    description: "是否提醒主线和可暂缓内容",
    values: [["off", "关闭"], ["on_request", "按需"], ["active", "主动"]],
  },
} as const;

export function suggestConfiguration(
  answers: SurveyAnswers,
  preferredSupports: PreferredSupport[],
): SupportConfiguration {
  const configuration: SupportConfiguration = { ...defaultConfiguration };

  if (answers.start_pattern === "hard_to_start") configuration.step_size = "small";
  if (answers.start_pattern === "needs_structure") configuration.structure_level = "full";
  if (answers.start_pattern === "detail_trap") configuration.scope_support = "active";
  if (answers.start_pattern === "free_explore") configuration.structure_level = "minimal";

  if (answers.stuck_pattern === "distracted") {
    configuration.step_size = "small";
    configuration.presentation_density = "low";
  }
  if (answers.stuck_pattern === "persistent_stuck") configuration.pattern_guidance = "active";
  if (answers.stuck_pattern === "detail_displacement") configuration.scope_support = "active";
  if (answers.stuck_pattern === "environment_overload") configuration.presentation_density = "low";
  if (answers.environment_preference === "quiet") configuration.presentation_density = "low";

  for (const support of preferredSupports) {
    if (support === "task_breaker") configuration.step_size = "small";
    if (support === "pattern_hinter") configuration.pattern_guidance = "active";
    if (support === "scope_guardian") configuration.scope_support = "active";
    if (support === "focus_mode") configuration.presentation_density = "low";
    if (support === "concept_concretizer") configuration.explanation_mode = "concrete_then_formal";
    if (support === "structure_template") configuration.structure_level = "full";
  }

  return configuration;
}
