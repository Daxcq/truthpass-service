export function Community({ onJoin }: { onJoin: () => void }) {
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
          <button className="join-btn" type="button" onClick={onJoin}>
            我愿意参与 →
          </button>
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
