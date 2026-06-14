import { useState, useCallback } from 'react';
import api from '../api/axios';
import BookCard, { BookCardSkeleton } from '../components/BookCard';
import Toast from '../components/Toast';

const SOURCES = [
  { id: 'google', label: 'Google Books' },
  { id: 'openlibrary', label: '📖 Read Free' },
];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [toast, setToast] = useState(null);
  const [adding, setAdding] = useState(null);
  const [source, setSource] = useState('google');

  const handleSearch = useCallback(async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const endpoint = source === 'openlibrary'
        ? `books/open-library/search/?q=${encodeURIComponent(query)}`
        : `books/search/?q=${encodeURIComponent(query)}`;
      const res = await api.get(endpoint);
      let items = res.data.results || [];
      // The "Read Free" tab only makes sense for books you can actually read in
      // full with no login. "borrowable" books require an Archive.org account and
      // only show a limited preview, so we keep just the public-domain ones.
      if (source === 'openlibrary') {
        items = items.filter(b => b.readable && b.ebook_access === 'public');
      }
      setResults(items);
    } catch {
      setToast({ message: 'Search failed. Check your connection.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [query, source]);

  const handleAddToShelf = async (book) => {
    setAdding(book.google_book_id);
    try {
      await api.post('shelf/', {
        google_book_id: book.google_book_id,
        title: book.title,
        authors: book.authors,
        thumbnail: book.thumbnail,
        page_count: book.page_count || 0,
        categories: book.categories || '',
        status: 'want_to_read',
      });
      setToast({ message: `"${book.title}" added to your shelf!`, type: 'success' });
    } catch (err) {
      const msg = err.response?.data?.non_field_errors?.[0] || 'Already on your shelf';
      setToast({ message: msg, type: 'error' });
    } finally {
      setAdding(null);
    }
  };

  const handleSourceChange = (newSource) => {
    if (newSource !== source) {
      setSource(newSource);
      setResults([]);
      setSearched(false);
    }
  };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '8px' }}>
          Search Books
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          {source === 'openlibrary'
            ? 'Books you can read for free right now, via Open Library'
            : 'Find any book and add it to your library'}
        </p>
      </div>

      {/* Pill Toggle & Search Input Group */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
        <div style={{
          display: 'flex', gap: '4px', background: 'var(--bg-surface)', 
          padding: '4px', borderRadius: 'var(--radius-md)', width: 'fit-content', border: '1px solid var(--border-subtle)'
        }}>
          {SOURCES.map(s => (
            <button
              key={s.id}
              onClick={() => handleSourceChange(s.id)}
              style={{
                padding: '6px 16px', borderRadius: '4px',
                border: 'none', cursor: 'pointer', fontSize: '13px',
                fontWeight: 600, transition: 'all 0.2s ease',
                background: source === s.id ? 'var(--bg-surface-active)' : 'transparent',
                color: source === s.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: source === s.id ? '0 1px 3px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px' }}>
          <input
            id="search-input"
            type="text"
            className="input-field"
            placeholder={source === 'openlibrary' ? 'Try "Pride and Prejudice", "Science"...' : 'Try "Dune", "Harry Potter"...'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1 }}
            autoFocus
          />
          <button id="search-submit" type="submit" className="btn-primary" disabled={loading} style={{ padding: '0 24px' }}>
            {loading ? '...' : 'Search'}
          </button>
        </form>
      </div>

      <div style={{ marginTop: '16px' }}>
        {/* Loading Skeletons */}
        {loading && (
          <div className="books-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <BookCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && results.length > 0 && (
          <div className="page-enter">
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
              Found {results.length} results
            </p>
            <div className="books-grid">
              {results.map(book => (
                <BookCard
                  key={book.google_book_id}
                  book={book}
                  onAddToShelf={adding === book.google_book_id ? null : handleAddToShelf}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty States */}
        {!loading && searched && results.length === 0 && (
          <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
            <svg style={{ width: '48px', height: '48px', marginBottom: '16px', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {source === 'openlibrary' ? 'No free copies found' : 'No matches found'}
            </p>
            <p style={{ fontSize: '14px', maxWidth: '380px', textAlign: 'center', lineHeight: 1.5 }}>
              {source === 'openlibrary'
                ? 'Only public-domain books can be read free without an account. Modern books usually aren’t available — try searching Google Books to add it to your library instead.'
                : 'Check your spelling or try a broader term.'}
            </p>
          </div>
        )}

        {!loading && !searched && (
          <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
             <svg style={{ width: '48px', height: '48px', marginBottom: '16px', opacity: 0.5 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Start searching</p>
            <p style={{ fontSize: '14px' }}>Powered by the {source === 'openlibrary' ? 'Open Library' : 'Google Books'} API.</p>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
