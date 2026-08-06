"use client";

import { ChangeEvent, FormEvent, useState } from "react";

import {
  configurationOptions,
  defaultAnswers,
  defaultConfiguration,
  PreferredSupport,
  supportChoices,
  SupportConfiguration,
  SurveyAnswers,
  surveyQuestions,
  suggestConfiguration,
  TaskState,
} from "@/lib/support";

type ProposedStateUpdate = {
  current_step: string | null;
  requirements_to_add: string[];
  completed_steps_to_add: string[];
  deferred_ideas_to_add: string[];
};

type InstructionalResponse = {
  explanation: string;
  next_action: string;
  optional_hint: string | null;
  proposed_state_update: ProposedStateUpdate | null;
  proposed_configuration_update: { reason: string; changes: Record<string, string> } | null;
};

type RewriteResponse = {
  original: string;
  support: InstructionalResponse;
  support_configuration: SupportConfiguration;
  selected_functions: string[];
  retrieved_sources: { text: string; page: number; filename: string; relevance: number }[];
};

const functionLabels: Record<string, string> = {
  focus_scaffold: "Focus Scaffold",
  explicit_patterner: "Explicit Patterner",
  creative_facilitator: "Creative Facilitator",
  sensory_shield: "Sensory Shield",
  scope_guardian: "Scope Guardian",
};

const example =
  "RAG 会先从外部知识库检索与问题相关的内容，再把这些内容连同用户问题一起交给语言模型生成回答。";

const initialTaskState: TaskState = {
  objective: "理解这段技术材料",
  requirements: ["只依据提供的材料解释"],
  current_step: null,
  completed_steps: [],
  deferred_ideas: [],
};

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

export default function Home() {
  const [text, setText] = useState(example);
  const [answers, setAnswers] = useState<SurveyAnswers>(defaultAnswers);
  const [preferredSupports, setPreferredSupports] = useState<PreferredSupport[]>([]);
  const [configuration, setConfiguration] = useState<SupportConfiguration>(defaultConfiguration);
  const [taskState, setTaskState] = useState<TaskState>(initialTaskState);
  const [suggestionStatus, setSuggestionStatus] = useState("当前使用中性默认值");
  const [result, setResult] = useState<RewriteResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isCustomized, setIsCustomized] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [query, setQuery] = useState("这份材料的核心概念是什么？");

  async function handlePdfUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingPdf(true);
    setPdfStatus(`正在读取 ${file.name}…`);
    setError("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/pdf/extract", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "PDF 解析失败。");
      setText(data.text);
      setDocumentId(data.document_id);
      setResult(null);
      setPdfStatus(
        `${data.filename} · ${data.page_count} 页 · ${data.chunk_count} 个检索片段已写入向量库`,
      );
    } catch (caught) {
      setPdfStatus("");
      setError(caught instanceof Error ? caught.message : "PDF 上传失败。");
    } finally {
      setUploadingPdf(false);
      event.target.value = "";
    }
  }

  function openSettings() {
    setShowSettings(true);
    requestAnimationFrame(() => document.getElementById("support-settings")?.scrollIntoView({ behavior: "smooth" }));
  }

  function toggleSupport(value: PreferredSupport) {
    setPreferredSupports((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      if (current.length >= 3) return current;
      return [...current, value];
    });
    setSuggestionStatus("问卷已变化，尚未应用新的建议");
  }

  function applySuggestions() {
    setConfiguration(suggestConfiguration(answers, preferredSupports));
    setSuggestionStatus("已应用启发式建议，你仍可修改任何设置");
    setIsCustomized(true);
  }

  function updateConfiguration<K extends keyof SupportConfiguration>(key: K, value: SupportConfiguration[K]) {
    setConfiguration((current) => ({ ...current, [key]: value }));
    setSuggestionStatus("已按你的选择修改");
    setIsCustomized(true);
  }

  function acceptStateUpdate(update: ProposedStateUpdate) {
    setTaskState((current) => ({
      ...current,
      current_step: update.current_step ?? current.current_step,
      requirements: unique([...current.requirements, ...update.requirements_to_add]),
      completed_steps: unique([...current.completed_steps, ...update.completed_steps_to_add]),
      deferred_ideas: unique([...current.deferred_ideas, ...update.deferred_ideas_to_add]),
    }));
    setResult((current) => current ? {
      ...current,
      support: { ...current.support, proposed_state_update: null },
    } : current);
    setIsCustomized(true);
  }

  function acceptConfigurationUpdate(update: Record<string, string>) {
    setConfiguration((current) => {
      const next = { ...current } as Record<string, string>;
      for (const [key, value] of Object.entries(update)) {
        if (!(key in configurationOptions)) continue;
        const validValues = configurationOptions[key as keyof SupportConfiguration].values.map(([item]) => item);
        if ((validValues as readonly string[]).includes(value)) next[key] = value;
      }
      return next as SupportConfiguration;
    });
    setResult((current) => current ? {
      ...current,
      support: { ...current.support, proposed_configuration_update: null },
    } : current);
    setIsCustomized(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: documentId ? "" : text,
          document_id: documentId,
          query: documentId ? query : null,
          support_configuration: configuration,
          task_state: taskState,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "生成支持失败，请稍后重试。");
      setResult(data);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "发生未知错误。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">LEARNER-CONTROLLED SCAFFOLDING · MVP</p>
        <h1>让 AI 按你需要的方式，呈现技术材料。</h1>
        <p className="subtitle">
          配置描述的是如何提供帮助，而不是你属于哪种学习者。问卷是基于论文设计维度改编的启发式入口，不是经过验证的测量工具。
        </p>
      </section>

      {showSettings && <div className="settings-stack" id="support-settings">
      <section className="profile-card">
        <div className="profile-intro">
          <span className="step">A</span>
          <div><p className="section-kicker">SUPPORT PREFERENCE CHECK</p><h2>哪些支持方式更适合这次阅读？</h2></div>
          <span className="non-diagnostic">不是诊断，也不会生成固定标签</span>
        </div>
        <div className="survey-list">
          {surveyQuestions.map((question, index) => (
            <fieldset className="survey-question" key={question.key}>
              <legend><b>0{index + 1}</b>{question.title}</legend>
              <div className="compact-options">
                {question.options.map((option) => {
                  const selected = answers[question.key] === option.value;
                  return (
                    <label className={selected ? "compact-option selected" : "compact-option"} key={option.value}>
                      <input type="radio" name={question.key} checked={selected} onChange={() => {
                        setAnswers((current) => ({ ...current, [question.key]: option.value }) as SurveyAnswers);
                        setSuggestionStatus("问卷已变化，尚未应用新的建议");
                      }} />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <fieldset className="survey-question support-question">
            <legend><b>04</b>希望 AI 提供哪些功能？最多选择 3 项</legend>
            <div className="support-options">
              {supportChoices.map((choice) => {
                const selected = preferredSupports.includes(choice.value);
                return (
                  <label className={selected ? "support-option selected" : "support-option"} key={choice.value}>
                    <input type="checkbox" checked={selected} disabled={!selected && preferredSupports.length >= 3} onChange={() => toggleSupport(choice.value)} />
                    <strong>{choice.label}</strong><small>{choice.detail}</small>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
        <button className="suggest-button" type="button" onClick={applySuggestions}>生成可编辑的支持建议</button>
      </section>

      <section className="configuration-card">
        <div className="configuration-heading">
          <span className="step">B</span>
          <div><p className="section-kicker">EDITABLE SUPPORT CONFIGURATION</p><h2>检查并修改支持设置</h2></div>
          <span className="configuration-status">{suggestionStatus}</span>
        </div>
        <div className="configuration-grid">
          {(Object.keys(configurationOptions) as (keyof SupportConfiguration)[]).map((key) => {
            const option = configurationOptions[key];
            return (
              <label className="configuration-field" key={key}>
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
                <select value={configuration[key]} onChange={(event) => updateConfiguration(key, event.target.value as never)}>
                  {option.values.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      </section>

      <section className="task-card">
        <div className="configuration-heading">
          <span className="step">C</span>
          <div><p className="section-kicker">CURRENT TASK STATE</p><h2>这次阅读要完成什么？</h2></div>
          <span className="configuration-status">只保存继续当前活动所需的信息</span>
        </div>
        <div className="task-grid">
          <label><strong>当前学习目标</strong><input value={taskState.objective} onChange={(event) => { setTaskState((current) => ({ ...current, objective: event.target.value })); setIsCustomized(true); }} /></label>
          <label><strong>当前步骤</strong><input placeholder="尚未定义" value={taskState.current_step ?? ""} onChange={(event) => { setTaskState((current) => ({ ...current, current_step: event.target.value || null })); setIsCustomized(true); }} /></label>
          <label className="wide"><strong>已授权要求（每行一项）</strong><textarea className="compact-textarea" value={taskState.requirements.join("\n")} onChange={(event) => { setTaskState((current) => ({ ...current, requirements: lines(event.target.value) })); setIsCustomized(true); }} /></label>
        </div>
        <details className="task-details">
          <summary>查看已完成步骤和稍后探索内容</summary>
          <div className="task-grid secondary-task-grid">
            <label><strong>已完成步骤</strong><textarea className="compact-textarea" value={taskState.completed_steps.join("\n")} onChange={(event) => setTaskState((current) => ({ ...current, completed_steps: lines(event.target.value) }))} /></label>
            <label><strong>稍后探索</strong><textarea className="compact-textarea" value={taskState.deferred_ideas.join("\n")} onChange={(event) => setTaskState((current) => ({ ...current, deferred_ideas: lines(event.target.value) }))} /></label>
          </div>
        </details>
      </section>
      </div>}

      <form className="workspace" onSubmit={handleSubmit}>
        <section className="panel input-panel">
          <div className="panel-heading"><div><span className="step">01</span><h2>技术材料</h2></div><span className="counter">{text.length} 字</span></div>
          <div className="material-actions">
            <label className={uploadingPdf ? "pdf-upload disabled" : "pdf-upload"}>
              <input type="file" accept="application/pdf,.pdf" disabled={uploadingPdf} onChange={handlePdfUpload} />
              <span>{uploadingPdf ? "正在解析 PDF…" : "上传 PDF"}</span>
            </label>
            <span className="material-divider">或直接粘贴文本</span>
          </div>
          {pdfStatus && <p className="pdf-status">✓ {pdfStatus}</p>}
          {documentId && (
            <label className="rag-query">
              <span>你想从这份 PDF 中理解什么？</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={500} />
            </label>
          )}
          <textarea aria-label="需要支持理解的技术材料" value={text} onChange={(event) => { setText(event.target.value); setDocumentId(null); setPdfStatus(""); }} maxLength={10_000} placeholder="粘贴一段技术材料……" />
          <div className="action-row">
            <button type="submit" disabled={loading || text.trim().length === 0 || taskState.objective.trim().length === 0}>{loading ? "正在编排支持…" : "生成学习支持"}</button>
            <button className="adjust-button" type="button" onClick={openSettings}>调整支持方式</button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>

        <section className="panel result-panel" aria-live="polite">
          <div className="panel-heading"><div><span className="step">02</span><h2>生成的支持</h2></div></div>
          <div className="quick-config-status">
            <span>{isCustomized ? "当前使用自定义支持设置" : "当前使用中性默认值"}</span>
            <button type="button" onClick={openSettings}>调整设置重新生成</button>
          </div>
          {result ? (
            <div className="structured-result">
              <div className="function-chips">{result.selected_functions.map((name) => <span key={name}>{functionLabels[name] ?? name}</span>)}</div>
              {result.retrieved_sources.length > 0 && (
                <details className="retrieved-sources">
                  <summary>RAG 检索了 {result.retrieved_sources.length} 个相关片段</summary>
                  <div>{result.retrieved_sources.map((source, index) => (
                    <article key={`${source.page}-${index}`}>
                      <strong>第 {source.page} 页 · 相关度 {Math.round(source.relevance * 100)}%</strong>
                      <p>{source.text}</p>
                    </article>
                  ))}</div>
                </details>
              )}
              <div className="result-copy">{result.support.explanation}</div>
              <div className="next-action"><small>NEXT ACTION</small><strong>{result.support.next_action}</strong></div>
              {result.support.optional_hint && <details className="optional-hint"><summary>展开可选提示</summary><p>{result.support.optional_hint}</p></details>}
              {result.support.proposed_state_update && (
                <div className="proposal"><small>待确认的任务状态更新</small><pre>{JSON.stringify(result.support.proposed_state_update, null, 2)}</pre><div><button type="button" onClick={() => acceptStateUpdate(result.support.proposed_state_update!)}>接受</button><button className="secondary-button" type="button" onClick={() => setResult((current) => current ? { ...current, support: { ...current.support, proposed_state_update: null } } : current)}>拒绝</button></div></div>
              )}
              {result.support.proposed_configuration_update && (
                <div className="proposal"><small>待确认的配置更新</small><p>{result.support.proposed_configuration_update.reason}</p><pre>{JSON.stringify(result.support.proposed_configuration_update.changes, null, 2)}</pre><div><button type="button" onClick={() => acceptConfigurationUpdate(result.support.proposed_configuration_update!.changes)}>接受</button><button className="secondary-button" type="button" onClick={() => setResult((current) => current ? { ...current, support: { ...current.support, proposed_configuration_update: null } } : current)}>拒绝</button></div></div>
              )}
            </div>
          ) : <div className="empty-state"><span>↗</span><p>提交材料后，解释、下一步和可选提示会分别显示。</p></div>}
        </section>
      </form>
    </main>
  );
}
