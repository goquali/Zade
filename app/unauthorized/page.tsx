export default function Unauthorized() {
  return <main className="shell"><section className="panel">
    <h1>Access not approved</h1>
    <p>This Google account is not authorized to view Zade's private dashboard.</p>
    <p>Please sign in using one of the two approved family accounts.</p>
    <a href="/sign-in">Back to sign in</a>
  </section></main>;
}
