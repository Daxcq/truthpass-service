import { useState } from "react";
import { postFeedback } from "../api";
import { FEEDBACK_TAGS } from "../data";

export function Community({ onToast }: { onToast: (msg: string) => void }) {
  const [consent, setConsent] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const submit = async () => {
    if (!consent || submitting) return;
    setSubmitting(true);
    try {
      const result = await postFeedback(tags);
      onToast(`已提交反馈，获得 ${result.contributionPoints} 点共建积分 · 哈希 ${result.evidenceHash.slice(0, 10)}…`);
      setConsent(false);
      setTags([]);
    } catch {
      onToast("提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section id="community" className="community">
        <div className="community-bar">
          <div className="community-head">
            <div className="community-emblem" aria-hidden="true">
              <img src="/assets/emblem-community.png" alt="" />
            </div>
            <div className="community-head-text">
              <h2>消费者共建</h2>
              <p>你的关注，让更好的食物和更透明的供应链成为可能。</p>
            </div>
          </div>

          <div className="community-items">
            <div className="community-item">
              <span className="ci-icon" aria-hidden="true">
                <img src="/assets/icon-sprout.png" alt="" />
              </span>
              <div>
                <h3>选择透明的产品</h3>
                <p>用消费支持可持续的供应链</p>
              </div>
            </div>
            <div className="community-item">
              <span className="ci-icon" aria-hidden="true">
                <img src="/assets/icon-camera.png" alt="" />
              </span>
              <div>
                <h3>分享体验</h3>
                <p>上传照片或使用感受</p>
              </div>
            </div>
            <div className="community-item">
              <span className="ci-icon" aria-hidden="true">
                <img src="/assets/icon-star.png" alt="" />
              </span>
              <div>
                <h3>反馈有价值的信息</h3>
                <p>参与完善公众知识库</p>
              </div>
            </div>
          </div>

          <div className="co-build-panel">
            <div className="consent-row">
              <span className="consent-icon" aria-hidden="true">
                ◌
              </span>
              <div className="consent-text">
                <strong>授权 FO-2026-001 的质量反馈</strong>
                <small>你可以随时撤销，不上传健康数据</small>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  aria-label="授权质量反馈"
                />
                <span />
              </label>
            </div>

            <div className="tag-list">
              {FEEDBACK_TAGS.map((tag) => (
                <button
                  key={tag}
                  className={tags.includes(tag) ? "feedback-tag active" : "feedback-tag"}
                  type="button"
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>

            <button
              className="join-btn full"
              type="button"
              disabled={!consent || submitting}
              onClick={submit}
            >
              <span>{submitting ? "提交中…" : "提交反馈"}</span>
              <span>获得 14 点共建积分</span>
            </button>
            <p className="consent-foot">这是消费服务权益，不代表股权、债权或投资回报。</p>
          </div>
        </div>
        <p className="community-note" aria-hidden="true">
          小小的参与，汇聚成更大的改变。
          <br />
          更好的选择
          <br />
          来自每一个认真的你
        </p>
      </section>

      <footer id="about" className="footer">
        <div className="brand">
          <span className="brand-zh">真验</span>
          <span className="brand-en">Zhenyan</span>
        </div>
        <span className="footer-divider">|</span>
        <p>让真实被看见，让信任自然发生</p>
        <span className="footer-right">为了更健康的海洋 · 更安心的餐桌 · 更可持续的未来</span>
        <span className="photo-icon" aria-hidden="true">
          ◉
        </span>
      </footer>
    </>
  );
}
