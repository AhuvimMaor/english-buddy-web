import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">🔎</div>
        <h1 className="text-xl font-bold text-gray-900">Page not found</h1>
        <Link href="/" className="inline-block mt-6 px-6 py-3 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 transition">
          Go home
        </Link>
      </div>
    </div>
  );
}
