import { FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/client';
import { useWriterAuth } from '../auth/WriterAuthContext';

export function LoginModal() {
  const nav = useNavigate();
  const formId = useId();
  const {
    loginModalOpen,
    setLoginModalOpen,
    loginNextPath,
    clearLoginNextPath,
    refresh
  } = useWriterAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dismiss = useCallback(() => {
    setLoginModalOpen(false);
    setError(null);
    clearLoginNextPath();
  }, [setLoginModalOpen, clearLoginNextPath]);

  useEffect(() => {
    if (!loginModalOpen) {
      return undefined;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismiss();
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [loginModalOpen, dismiss]);

  if (!loginModalOpen) {
    return null;
  }

  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      dismiss();
    }
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      await refresh();
      const next = loginNextPath;
      clearLoginNextPath();
      setLoginModalOpen(false);
      setUsername('');
      setPassword('');
      if (next && next !== '/') {
        nav(next, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="login-modal-backdrop"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        className="login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
      >
        <button type="button" className="login-modal__close" onClick={dismiss} aria-label="关闭">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
        <div className="google-card google-card--compact">
          <div className="google-card__logo" aria-hidden="true">
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 8h16v26H12V8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M16 14h8M16 19h8M16 24h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1 id={`${formId}-title`} className="google-card__title">
            登录
          </h1>
          <p className="google-card__subtitle">使用管理员为您开通的写作者账号进入工作台。</p>

          <form className="google-card__form" onSubmit={onSubmit} noValidate>
            <div className="google-field">
              <label htmlFor={`${formId}-user`}>用户名或电子邮件</label>
              <input
                id={`${formId}-user`}
                className="google-field__input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div className="google-field">
              <label htmlFor={`${formId}-pass`}>密码</label>
              <input
                id={`${formId}-pass`}
                className="google-field__input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error ? (
              <p className="google-card__error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="google-card__actions">
              <button type="button" className="google-btn google-btn--text" onClick={dismiss}>
                取消
              </button>
              <button className="google-btn google-btn--primary" type="submit" disabled={loading} aria-busy={loading}>
                {loading ? '请稍候…' : '登录'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
