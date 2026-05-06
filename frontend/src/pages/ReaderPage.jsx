import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';

export default function ReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [readerData, setReaderData] = useState(null);
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Real progress from the backend shelf
  const [currentPage, setCurrentPage] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [shelfBookId, setShelfBookId] = useState(null);

  const bookTitle = state?.title || 'Book';
  const bookAuthor = state?.authors || '';

  useEffect(() => {
    // If we already have reader data passed via state
    if (state?.readUrl) {
      setReaderData({
        available: true,
        read_url: state.readUrl,
        ebook_access: state.ebookAccess || 'unknown',
      });
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ title: bookTitle });
    if (bookAuthor) params.append('author', bookAuthor);

    api.get(`books/open-library/?${params.toString()}`)
      .then(res => {
        if (res.data.available) {
          setReaderData(res.data);
        } else {
          setError('This book is not available for reading on Open Library.');
        }
      })
      .catch(() => {
        setError('Failed to look up book availability.');
      })
      .finally(() => setLoading(false));
  }, [id, bookTitle, bookAuthor, state]);

  // Fetch real progress from the user's shelf for this specific book
  useEffect(() => {
    if (!id) return;
    api.get('shelf/')
      .then(res => {
        const match = res.data.find(b => b.google_book_id === id);
        if (match) {
          setShelfBookId(match.id);
          setCurrentPage(match.total_pages_read || 0);
          setProgressPercent(match.progress_percent || 0);
        }
      })
      .catch(() => {}); // silently ignore if not on shelf
  }, [id]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, /* High z-index to overlay entirely */
      background: 'var(--bg-base)', display: 'flex', flexDirection: 'column',
    }}>
      
      {/* Sticky Reader Top Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', zIndex: 10
      }}>
        
        {/* Left: Nav & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1, minWidth: 0 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            title="Go Back"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{
              fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              letterSpacing: '-0.01em', lineHeight: 1.2
            }}>
              {bookTitle}
            </h2>
            {bookAuthor && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                {bookAuthor}
              </p>
            )}
          </div>
        </div>

        {/* Center: Explicit Progress (Requested) */}
        {!loading && !error && (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <span style={{ 
              fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)',
              background: 'var(--bg-base)', padding: '6px 12px', borderRadius: '100px',
              border: '1px solid var(--border-subtle)'
            }}>
              Page {currentPage} &bull; {progressPercent}% completed
            </span>
          </div>
        )}

        {/* Right: Controls (Bookmark) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flex: 1 }}>
          {!loading && !error && (
            <button
              onClick={() => setIsBookmarked(!isBookmarked)}
              style={{
                background: 'transparent', border: 'none',
                color: isBookmarked ? 'var(--accent-primary)' : 'var(--text-muted)',
                cursor: 'pointer', padding: '8px', borderRadius: '4px',
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '13px', fontWeight: 600
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <svg width="18" height="18" fill={isBookmarked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Bookmark
            </button>
          )}
        </div>

      </div>

      {/* Content Area */}
      <div style={{ flex: 1, position: 'relative', background: '#000' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', background: 'var(--bg-base)'
          }}>
            <div className="shimmer" style={{ width: '48px', height: '64px', borderRadius: '4px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading reading experience...</p>
          </div>
        )}

        {error && (
          <div className="page-enter" style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', background: 'var(--bg-base)'
          }}>
            <svg width="48" height="48" style={{ opacity: 0.3 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Not Available</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '400px', textAlign: 'center' }}>
               Only explicitly readable/borrowable books from the Internet Archive are accessible here.
            </p>
          </div>
        )}

        {readerData && !loading && !error && (
          <iframe
            src={readerData.read_url}
            title={`Read ${bookTitle}`}
            style={{
              width: '100%', height: '100%', border: 'none',
              background: '#000', display: 'block'
            }}
            allowFullScreen
          />
        )}
      </div>

    </div>
  );
}
