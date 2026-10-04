import { Link } from 'react-router';

export function NoData() {
  return (
    <section className="card">
      <p className="muted">
        まだ大会データがありません。<Link to="/data">データ管理</Link>からCSVを取り込んでください。
      </p>
    </section>
  );
}
