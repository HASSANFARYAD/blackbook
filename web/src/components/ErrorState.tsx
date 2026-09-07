import { Link } from "react-router-dom";

/**
 * A failed page still needs to be a page: a heading so the view is identifiable,
 * and a route back so a bad deep link is not a dead end.
 */
export default function ErrorState({
  title = "This decision could not be loaded",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="page">
      <p className="crumbs">
        <Link to="/">Command Center</Link>
        <span> / </span>
        <span>Not available</span>
      </p>
      <h1>{title}</h1>
      <p className="error">{message}</p>
      <p className="actions">
        <Link className="btn btn-primary" to="/">
          Back to Command Center
        </Link>
      </p>
    </div>
  );
}
