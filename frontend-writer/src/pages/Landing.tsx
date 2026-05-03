import { Link } from 'react-router-dom';
import { useWriterAuth } from '../auth/WriterAuthContext';

export function Landing() {
  const { openLoginModal } = useWriterAuth();

  return (
    <div className="landing">
      <section className="landing__hero panel">
        <h1 className="landing__headline">论文工作台</h1>
        <p className="landing__lede">
          管理课题与参考文献，完成 RAG 入库、大纲与章节生成。登录后创建项目并进入论文向导。
        </p>
        <div className="landing__cta-row">
          <button type="button" className="btn btn--primary" onClick={() => openLoginModal()}>
            登录
          </button>
          <span className="landing__hint muted">账号由管理员在后台开通</span>
        </div>
      </section>

      <section className="landing__grid">
        <article className="landing__tile">
          <h2 className="landing__tile-title">项目与模板</h2>
          <p className="muted landing__tile-copy">按学校模板与学科创建课题，统一管理标准参考文献。</p>
        </article>
        <article className="landing__tile">
          <h2 className="landing__tile-title">RAG 与生成</h2>
          <p className="muted landing__tile-copy">确认切片与向量索引后，在课题范围内检索并生成章节草稿。</p>
        </article>
        <article className="landing__tile">
          <h2 className="landing__tile-title">余额与导出</h2>
          <p className="muted landing__tile-copy">查看钱包与调用记录，导出 Markdown、LaTeX 或 Word。</p>
        </article>
      </section>

      <p className="landing__foot muted">
        已在其他设备登录？{' '}
        <button type="button" className="landing__linklike" onClick={() => openLoginModal()}>
          在此登录
        </button>
        {' · '}
        <Link to="/wizard" className="landing__link">
          进入向导（需登录）
        </Link>
      </p>
    </div>
  );
}
