// Static page precached by the service worker. Contains no private data.
export const dynamic = 'force-static';

export default function Offline() {
  return (
    <main className="landing">
      <div className="container text-center" style={{ maxWidth: 480 }}>
        <h1 className="h3 fw-bold">You are offline</h1>
        <p className="mb-3" style={{ color: '#cfe0f1' }}>Perez Ice needs an internet connection to load and save sales, payments and deliveries. Nothing has been recorded while you were offline.</p>
        <a className="btn btn-light btn-lg" href="/">Try again</a>
      </div>
    </main>
  );
}
