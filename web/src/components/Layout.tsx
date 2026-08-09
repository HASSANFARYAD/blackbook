import { Link, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          BLACK<span>BOOK</span>
        </Link>
        <span className="tagline">IP DEVELOPMENT INTELLIGENCE</span>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="foot">
        Research an IP · Make a decision · Remember why · Detect when it should change
      </footer>
    </div>
  );
}
