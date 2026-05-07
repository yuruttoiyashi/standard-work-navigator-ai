import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

type Difficulty = "初級" | "中級" | "上級";
type Status = "下書き" | "公開中" | "要更新";

type AiResult = {
  summary: string;
  trainingPoints: string[];
  riskPoints: string[];
  standardChecklist: string[];
  handoverMemo: string;
  managerComment: string;
};

type Procedure = {
  id: string;
  title: string;
  category: string;
  targetRole: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  purpose: string;
  tools: string;
  stepsText: string;
  attention: string;
  commonMistakes: string;
  checklistText: string;
  owner: string;
  status: Status;
  updatedAt: string;
  checked: boolean;
  ai?: AiResult | null;
};

const STORAGE_KEY = "standard-work-navigator-ai-v1";

const generateWorkGuide = httpsCallable(functions, "generateWorkGuide");

const sampleProcedures: Procedure[] = [
  {
    id: crypto.randomUUID(),
    title: "入荷検品前の数量確認",
    category: "物流 / 入荷",
    targetRole: "新人スタッフ・応援スタッフ",
    difficulty: "初級",
    estimatedMinutes: 15,
    purpose:
      "入荷品の数量差異や確認漏れを防ぐため、検品前に伝票・現物・置き場を確認する。",
    tools: "入荷伝票、ハンディ、筆記用具、検品リスト",
    stepsText:
      "1. 入荷伝票の便名・日付・荷主名を確認する。\n2. 現物のパレット数・ケース数をざっくり確認する。\n3. 破損・汚損・ラベル不備がないか見る。\n4. ハンディで検品対象を開く。\n5. 数量差異があれば、すぐに管理者へ報告する。",
    attention:
      "数量差異を自己判断で修正しない。破損品は通常品と混ぜず、報告する。",
    commonMistakes:
      "似た品番の見間違い、便名違い、伝票だけ確認して現物確認を飛ばすこと。",
    checklistText:
      "伝票確認済み\n現物確認済み\n破損確認済み\n差異報告済み",
    owner: "佐藤祐美",
    status: "公開中",
    updatedAt: new Date().toISOString().slice(0, 10),
    checked: false,
    ai: null,
  },
];

const emptyForm: Procedure = {
  id: "",
  title: "",
  category: "物流 / 標準作業",
  targetRole: "新人スタッフ",
  difficulty: "初級",
  estimatedMinutes: 10,
  purpose: "",
  tools: "",
  stepsText: "",
  attention: "",
  commonMistakes: "",
  checklistText: "",
  owner: "佐藤祐美",
  status: "下書き",
  updatedAt: new Date().toISOString().slice(0, 10),
  checked: false,
  ai: null,
};

function App() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [form, setForm] = useState<Procedure>(emptyForm);
  const [selectedId, setSelectedId] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setProcedures(JSON.parse(saved));
    } else {
      setProcedures(sampleProcedures);
      setSelectedId(sampleProcedures[0].id);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(procedures));
  }, [procedures]);

  const selected = useMemo(
    () => procedures.find((item) => item.id === selectedId) || procedures[0],
    [procedures, selectedId]
  );

  const filteredProcedures = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return procedures;
    return procedures.filter((item) => {
      return [
        item.title,
        item.category,
        item.targetRole,
        item.status,
        item.purpose,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [procedures, keyword]);

  const dashboard = useMemo(() => {
    const total = procedures.length;
    const published = procedures.filter((p) => p.status === "公開中").length;
    const needUpdate = procedures.filter((p) => p.status === "要更新").length;
    const checked = procedures.filter((p) => p.checked).length;
    const aiGenerated = procedures.filter((p) => p.ai).length;
    const averageMinutes =
      total === 0
        ? 0
        : Math.round(
            procedures.reduce((sum, p) => sum + Number(p.estimatedMinutes || 0), 0) /
              total
          );

    return {
      total,
      published,
      needUpdate,
      checked,
      aiGenerated,
      averageMinutes,
    };
  }, [procedures]);

  function updateForm<K extends keyof Procedure>(key: K, value: Procedure[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function resetForm() {
    setForm({
      ...emptyForm,
      id: "",
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setMessage("");
  }

  function saveProcedure() {
    if (!form.title.trim() || !form.purpose.trim() || !form.stepsText.trim()) {
      setMessage("作業名・作業目的・作業手順は必須です。");
      return;
    }

    if (form.id) {
      setProcedures((prev) =>
        prev.map((item) =>
          item.id === form.id
            ? {
                ...form,
                updatedAt: new Date().toISOString().slice(0, 10),
              }
            : item
        )
      );
      setSelectedId(form.id);
      setMessage("手順書を更新しました。");
    } else {
      const newItem: Procedure = {
        ...form,
        id: crypto.randomUUID(),
        updatedAt: new Date().toISOString().slice(0, 10),
      };
      setProcedures((prev) => [newItem, ...prev]);
      setSelectedId(newItem.id);
      setForm(newItem);
      setMessage("手順書を登録しました。");
    }
  }

  function editProcedure(item: Procedure) {
    setForm(item);
    setSelectedId(item.id);
    setMessage("編集モードに切り替えました。");
  }

  function deleteProcedure(id: string) {
    if (!confirm("この手順書を削除しますか？")) return;
    setProcedures((prev) => prev.filter((item) => item.id !== id));
    setSelectedId("");
    resetForm();
  }

  function toggleChecked(id: string) {
    setProcedures((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              checked: !item.checked,
            }
          : item
      )
    );
  }

  async function runGemini() {
    const target = form.id ? form : selected || form;

    if (!target.title.trim() || !target.purpose.trim() || !target.stepsText.trim()) {
      setMessage("AI生成には、作業名・作業目的・作業手順が必要です。");
      return;
    }

    setIsGenerating(true);
    setMessage("Geminiで教育ポイントを生成中です...");

    try {
      const result = await generateWorkGuide({
        procedure: target,
      });

      const ai = result.data as AiResult;

      const updatedItem: Procedure = {
        ...target,
        ai,
        status: target.status === "下書き" ? "公開中" : target.status,
        updatedAt: new Date().toISOString().slice(0, 10),
      };

      if (target.id) {
        setProcedures((prev) =>
          prev.map((item) => (item.id === target.id ? updatedItem : item))
        );
        setForm(updatedItem);
        setSelectedId(target.id);
      } else {
        const newItem = {
          ...updatedItem,
          id: crypto.randomUUID(),
        };
        setProcedures((prev) => [newItem, ...prev]);
        setForm(newItem);
        setSelectedId(newItem.id);
      }

      setMessage("Geminiの標準作業ナビゲーションを生成しました。");
    } catch (error) {
      console.error(error);
      setMessage(
        "AI生成に失敗しました。Firebase Functionsのデプロイ、Secret、Firebase設定を確認してください。"
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function printReport() {
    window.print();
  }

  const detail = selected || form;

  return (
    <>
      <style>{styles}</style>

      <div className="app">
        <header className="hero no-print">
          <div>
            <p className="eyebrow">Standard Work Navigator AI</p>
            <h1>標準作業手順・新人教育ナビゲーション</h1>
            <p className="lead">
              作業手順・注意点・教育チェック・AI要約を一元管理し、
              属人化防止と引き継ぎ品質の向上を支援する業務改善アプリです。
            </p>
          </div>

          <div className="heroPanel">
            <span>Gemini Connected</span>
            <strong>Firebase Functions</strong>
            <small>APIキーはサーバー側で安全管理</small>
          </div>
        </header>

        <section className="dashboard no-print">
          <Metric label="登録手順" value={`${dashboard.total}件`} />
          <Metric label="公開中" value={`${dashboard.published}件`} />
          <Metric label="要更新" value={`${dashboard.needUpdate}件`} />
          <Metric label="確認済み" value={`${dashboard.checked}件`} />
          <Metric label="AI生成済み" value={`${dashboard.aiGenerated}件`} />
          <Metric label="平均時間" value={`${dashboard.averageMinutes}分`} />
        </section>

        <main className="layout">
          <section className="card formCard no-print">
            <div className="sectionTitle">
              <div>
                <p className="eyebrow">Create / Edit</p>
                <h2>手順書登録</h2>
              </div>
              <button className="ghostButton" onClick={resetForm}>
                新規
              </button>
            </div>

            {message && <div className="message">{message}</div>}

            <label>
              作業名
              <input
                value={form.title}
                onChange={(e) => updateForm("title", e.target.value)}
                placeholder="例：入荷検品前の数量確認"
              />
            </label>

            <div className="twoColumn">
              <label>
                カテゴリ
                <input
                  value={form.category}
                  onChange={(e) => updateForm("category", e.target.value)}
                  placeholder="物流 / 入荷"
                />
              </label>

              <label>
                対象者
                <input
                  value={form.targetRole}
                  onChange={(e) => updateForm("targetRole", e.target.value)}
                  placeholder="新人スタッフ"
                />
              </label>
            </div>

            <div className="twoColumn">
              <label>
                難易度
                <select
                  value={form.difficulty}
                  onChange={(e) =>
                    updateForm("difficulty", e.target.value as Difficulty)
                  }
                >
                  <option value="初級">初級</option>
                  <option value="中級">中級</option>
                  <option value="上級">上級</option>
                </select>
              </label>

              <label>
                想定時間・分
                <input
                  type="number"
                  value={form.estimatedMinutes}
                  onChange={(e) =>
                    updateForm("estimatedMinutes", Number(e.target.value))
                  }
                />
              </label>
            </div>

            <label>
              作業目的
              <textarea
                value={form.purpose}
                onChange={(e) => updateForm("purpose", e.target.value)}
                placeholder="この作業を行う目的を入力"
              />
            </label>

            <label>
              必要なもの
              <textarea
                value={form.tools}
                onChange={(e) => updateForm("tools", e.target.value)}
                placeholder="使用する帳票・端末・道具など"
              />
            </label>

            <label>
              作業手順
              <textarea
                className="largeText"
                value={form.stepsText}
                onChange={(e) => updateForm("stepsText", e.target.value)}
                placeholder={"1. ○○を確認する\n2. ○○を入力する\n3. 管理者へ報告する"}
              />
            </label>

            <label>
              注意点
              <textarea
                value={form.attention}
                onChange={(e) => updateForm("attention", e.target.value)}
                placeholder="事故・ミス・遅延につながる注意点"
              />
            </label>

            <label>
              よくあるミス
              <textarea
                value={form.commonMistakes}
                onChange={(e) => updateForm("commonMistakes", e.target.value)}
                placeholder="新人が間違えやすい点"
              />
            </label>

            <label>
              チェック項目
              <textarea
                value={form.checklistText}
                onChange={(e) => updateForm("checklistText", e.target.value)}
                placeholder={"伝票確認済み\n数量確認済み\n差異報告済み"}
              />
            </label>

            <div className="twoColumn">
              <label>
                担当者
                <input
                  value={form.owner}
                  onChange={(e) => updateForm("owner", e.target.value)}
                />
              </label>

              <label>
                状態
                <select
                  value={form.status}
                  onChange={(e) => updateForm("status", e.target.value as Status)}
                >
                  <option value="下書き">下書き</option>
                  <option value="公開中">公開中</option>
                  <option value="要更新">要更新</option>
                </select>
              </label>
            </div>

            <div className="buttonRow">
              <button onClick={saveProcedure}>保存</button>
              <button className="aiButton" onClick={runGemini} disabled={isGenerating}>
                {isGenerating ? "AI生成中..." : "Geminiで教育資料化"}
              </button>
            </div>
          </section>

          <section className="rightArea">
            <div className="card no-print">
              <div className="sectionTitle">
                <div>
                  <p className="eyebrow">Library</p>
                  <h2>手順書一覧</h2>
                </div>
              </div>

              <input
                className="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="作業名・カテゴリ・対象者で検索"
              />

              <div className="list">
                {filteredProcedures.map((item) => (
                  <article
                    key={item.id}
                    className={`listItem ${
                      selectedId === item.id ? "active" : ""
                    }`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div>
                      <strong>{item.title}</strong>
                      <p>
                        {item.category} / {item.difficulty} / {item.estimatedMinutes}
                        分
                      </p>
                    </div>
                    <div className="listActions">
                      <span className={`status ${item.status}`}>{item.status}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          editProcedure(item);
                        }}
                      >
                        編集
                      </button>
                      <button
                        className="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProcedure(item.id);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <section className="card reportCard">
              <div className="sectionTitle no-print">
                <div>
                  <p className="eyebrow">A4 Report</p>
                  <h2>標準作業ナビゲーション</h2>
                </div>
                <button onClick={printReport}>A4印刷</button>
              </div>

              {detail ? (
                <div className="report">
                  <div className="reportHeader">
                    <div>
                      <p className="documentLabel">職場提出用 標準作業手順書</p>
                      <h2>{detail.title || "未選択"}</h2>
                    </div>
                    <div className="stamp">
                      <span>{detail.status}</span>
                    </div>
                  </div>

                  <div className="metaGrid">
                    <Info label="カテゴリ" value={detail.category} />
                    <Info label="対象者" value={detail.targetRole} />
                    <Info label="難易度" value={detail.difficulty} />
                    <Info label="想定時間" value={`${detail.estimatedMinutes}分`} />
                    <Info label="担当者" value={detail.owner} />
                    <Info label="更新日" value={detail.updatedAt} />
                  </div>

                  <ReportBlock title="作業目的" text={detail.purpose} />
                  <ReportBlock title="必要なもの" text={detail.tools} />
                  <ReportBlock title="作業手順" text={detail.stepsText} ordered />
                  <ReportBlock title="注意点" text={detail.attention} />
                  <ReportBlock title="よくあるミス" text={detail.commonMistakes} />
                  <ReportBlock title="チェック項目" text={detail.checklistText} checklist />

                  {detail.ai && (
                    <div className="aiReport">
                      <h3>Gemini AIによる教育・引き継ぎポイント</h3>

                      <ReportBlock title="作業概要" text={detail.ai.summary} />
                      <ReportList title="教育時の重点ポイント" items={detail.ai.trainingPoints} />
                      <ReportList title="リスクポイント" items={detail.ai.riskPoints} />
                      <ReportList title="標準チェックリスト" items={detail.ai.standardChecklist} />
                      <ReportBlock title="引き継ぎメモ" text={detail.ai.handoverMemo} />
                      <ReportBlock title="管理者向けコメント" text={detail.ai.managerComment} />
                    </div>
                  )}

                  {detail.id && (
                    <div className="educationCheck no-print">
                      <label className="checkLine">
                        <input
                          type="checkbox"
                          checked={detail.checked}
                          onChange={() => toggleChecked(detail.id)}
                        />
                        この手順を確認済みにする
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                <p>手順書を登録すると、ここにA4レポートが表示されます。</p>
              )}
            </section>
          </section>
        </main>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function ReportBlock({
  title,
  text,
  ordered = false,
  checklist = false,
}: {
  title: string;
  text?: string;
  ordered?: boolean;
  checklist?: boolean;
}) {
  const lines = (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  return (
    <section className="reportBlock">
      <h3>{title}</h3>
      {ordered ? (
        <ol>
          {lines.map((line, index) => (
            <li key={index}>{line.replace(/^\d+\.\s*/, "")}</li>
          ))}
        </ol>
      ) : checklist ? (
        <ul className="checklist">
          {lines.map((line, index) => (
            <li key={index}>□ {line}</li>
          ))}
        </ul>
      ) : (
        <p>{text}</p>
      )}
    </section>
  );
}

function ReportList({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="reportBlock">
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

const styles = `
:root {
  color: #172033;
  background: #eef3f8;
  font-family: Inter, "Noto Sans JP", system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  border: 0;
  border-radius: 12px;
  padding: 10px 16px;
  background: #123b66;
  color: white;
  cursor: pointer;
  font-weight: 700;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

button:hover:not(:disabled) {
  filter: brightness(1.05);
}

.app {
  min-height: 100vh;
  padding: 28px;
}

.hero {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: stretch;
  margin-bottom: 22px;
}

.hero,
.card,
.metric {
  border: 1px solid rgba(18, 59, 102, 0.12);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 45px rgba(17, 37, 73, 0.08);
  border-radius: 28px;
}

.hero {
  padding: 32px;
  background:
    radial-gradient(circle at top left, rgba(60, 135, 190, 0.18), transparent 35%),
    linear-gradient(135deg, #ffffff, #f7fbff);
}

.eyebrow {
  margin: 0 0 8px;
  color: #55708f;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  font-size: clamp(28px, 4vw, 46px);
  line-height: 1.12;
  margin-bottom: 14px;
}

.lead {
  color: #526477;
  line-height: 1.8;
  max-width: 820px;
  margin-bottom: 0;
}

.heroPanel {
  border-radius: 24px;
  padding: 24px;
  color: white;
  background:
    linear-gradient(145deg, rgba(18, 59, 102, 0.96), rgba(37, 99, 145, 0.96));
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.heroPanel span,
.heroPanel small {
  color: #cfe2f5;
}

.heroPanel strong {
  font-size: 26px;
}

.dashboard {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 14px;
  margin-bottom: 22px;
}

.metric {
  padding: 18px;
}

.metric span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.metric strong {
  display: block;
  font-size: 25px;
  margin-top: 8px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(360px, 470px) 1fr;
  gap: 22px;
  align-items: start;
}

.rightArea {
  display: grid;
  gap: 22px;
}

.card {
  padding: 24px;
}

.sectionTitle {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.sectionTitle h2 {
  margin-bottom: 0;
}

label {
  display: grid;
  gap: 7px;
  color: #42526a;
  font-weight: 800;
  font-size: 13px;
  margin-bottom: 14px;
}

input,
textarea,
select {
  width: 100%;
  border: 1px solid #d7e1ec;
  border-radius: 14px;
  padding: 12px 13px;
  background: #fbfdff;
  color: #172033;
  outline: none;
}

textarea {
  min-height: 82px;
  resize: vertical;
  line-height: 1.7;
}

.largeText {
  min-height: 150px;
}

.twoColumn {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.buttonRow {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.aiButton {
  background: linear-gradient(135deg, #7c3aed, #2563eb);
}

.ghostButton {
  background: #e9f1fa;
  color: #123b66;
}

.message {
  border-radius: 14px;
  padding: 12px 14px;
  background: #eef6ff;
  color: #17446f;
  font-weight: 700;
  margin-bottom: 16px;
}

.search {
  margin-bottom: 14px;
}

.list {
  display: grid;
  gap: 12px;
  max-height: 460px;
  overflow: auto;
  padding-right: 4px;
}

.listItem {
  border: 1px solid #dbe6f1;
  border-radius: 18px;
  padding: 16px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  cursor: pointer;
  background: #ffffff;
}

.listItem.active {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.listItem p {
  color: #64748b;
  margin: 6px 0 0;
  font-size: 13px;
}

.listActions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.listActions button {
  padding: 7px 10px;
  border-radius: 10px;
  font-size: 12px;
}

.danger {
  background: #b42318;
}

.status {
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.status.公開中 {
  background: #e8f7ef;
  color: #137447;
}

.status.下書き {
  background: #f1f5f9;
  color: #475569;
}

.status.要更新 {
  background: #fff4e5;
  color: #b54708;
}

.reportCard {
  background: #ffffff;
}

.report {
  color: #111827;
}

.reportHeader {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 3px solid #123b66;
  padding-bottom: 18px;
  margin-bottom: 18px;
}

.documentLabel {
  color: #53657a;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.reportHeader h2 {
  font-size: 30px;
  margin-bottom: 0;
}

.stamp {
  min-width: 92px;
  height: 92px;
  border: 3px solid #123b66;
  border-radius: 18px;
  display: grid;
  place-items: center;
  color: #123b66;
  font-weight: 900;
  transform: rotate(3deg);
}

.metaGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid #d8e2ee;
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 20px;
}

.info {
  padding: 12px;
  border-right: 1px solid #d8e2ee;
  border-bottom: 1px solid #d8e2ee;
}

.info span {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 4px;
}

.info strong {
  font-size: 14px;
}

.reportBlock {
  margin-bottom: 18px;
  break-inside: avoid;
}

.reportBlock h3 {
  font-size: 16px;
  color: #123b66;
  padding-left: 10px;
  border-left: 5px solid #123b66;
  margin-bottom: 8px;
}

.reportBlock p,
.reportBlock li {
  line-height: 1.8;
  white-space: pre-wrap;
}

.reportBlock ol,
.reportBlock ul {
  margin-top: 0;
  padding-left: 24px;
}

.checklist {
  list-style: none;
  padding-left: 0 !important;
}

.aiReport {
  border: 2px solid #dbeafe;
  background: #f8fbff;
  border-radius: 20px;
  padding: 18px;
  margin-top: 22px;
}

.aiReport > h3 {
  margin-bottom: 16px;
  color: #1d4ed8;
}

.educationCheck {
  border-top: 1px solid #dbe6f1;
  margin-top: 20px;
  padding-top: 16px;
}

.checkLine {
  display: flex;
  align-items: center;
  gap: 10px;
}

.checkLine input {
  width: auto;
}

@media (max-width: 1180px) {
  .hero,
  .layout {
    grid-template-columns: 1fr;
  }

  .dashboard {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 720px) {
  .app {
    padding: 14px;
  }

  .dashboard,
  .twoColumn,
  .metaGrid {
    grid-template-columns: 1fr;
  }

  .listItem {
    grid-template-columns: 1fr;
  }

  .listActions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}

@media print {
  body {
    background: white;
  }

  .no-print {
    display: none !important;
  }

  .app {
    padding: 0;
  }

  .layout,
  .rightArea {
    display: block;
  }

  .reportCard,
  .card {
    box-shadow: none;
    border: 0;
    padding: 0;
  }

  .report {
    width: 210mm;
    min-height: 297mm;
    padding: 16mm;
    margin: 0 auto;
  }

  .reportHeader h2 {
    font-size: 24px;
  }

  .metaGrid {
    grid-template-columns: repeat(3, 1fr);
  }

  .aiReport {
    border-color: #cbd5e1;
    background: white;
  }
}
`;

export default App;